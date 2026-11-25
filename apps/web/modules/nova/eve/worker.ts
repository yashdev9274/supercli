import prisma, { type Prisma } from "@super/db"
import { isIntegrationId } from "@super/agent-runtime/integrations"
import { remoteConfig, submitRemoteTurn, readRemoteBatch, controlRemoteTurn } from "@super/nova-runtime/remote"
import type { NovaScope } from "@super/nova-runtime/scope"
import { inngest } from "@/inngest/client"
import { projectEveEvent, eventCursor, type EveProjectionState } from "./projection"
import type { EveAdmissionPayload } from "./admission"
import { isSpecialistRole } from "@super/nova-runtime/specialists"

const CAPABILITY = "nova-eve:admission"
const terminal = (status: string) => ["completed", "failed", "cancelled"].includes(status)
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue

async function load(runId: string) {
  return prisma.toolInvocation.findFirstOrThrow({ where: { runId, capability: CAPABILITY }, include: { run: true } })
}

export async function queueEveRun(runId: string, cause: "submit" | "cancel" = "submit"): Promise<void> {
  await inngest.send({ name: "nova/eve.dispatch.requested", id: cause === "submit" ? `nova-eve:${runId}` : `nova-eve:cancel:${runId}:${Date.now()}`, data: { runId } })
}

export async function dispatchEveRun(runId: string): Promise<void> {
  const row = await load(runId)
  if (terminal(row.run.status)) return
  const payload = row.arguments as unknown as EveAdmissionPayload
  const state = row.result as unknown as EveProjectionState
  if (row.run.cancellationAt && !state.runtimeSessionId) {
    if (row.startedAt) throw new Error("Remote admission outcome is uncertain; automatic resubmission after cancellation is unsafe")
    await failEveRun(runId, "cancelled")
    return
  }
  const users = (process.env.NOVA_EVE_CANARY_USER_IDS ?? "").split(",").map((value) => value.trim())
  if (process.env.NOVA_EVE_CANARY_ENABLED !== "true" || !users.includes(payload.scope.userId)) throw new Error("Eve canary admission is disabled")
  if (Date.parse(payload.expiresAt) <= Date.now()) throw new Error("Eve canary run expired")
  if (!isIntegrationId(payload.scope.provider)) throw new Error("Unsupported Eve provider")
  if (state.runtimeSessionId) return
  await prisma.toolInvocation.update({ where: { id: row.id }, data: { status: "executing", startedAt: row.startedAt ?? new Date() } })
  const config = remoteConfig()
  const history = payload.history.map((message) => `${message.role}: ${message.text}`).join("\n\n")
  const content = `${history ? `Previous conversation (context only):\n${history}\n\n` : ""}Current request:\n${payload.content}${payload.repository ? `\n\nExecution target: isolated cloud checkout of ${payload.repository.repositoryFullName}. Authorized validation commands: ${JSON.stringify(payload.repository.validationCommands)}. You must call repository_verify and repository_finish successfully before reporting a verified implementation. No publication is permitted.` : ""}`
  const id = await submitRemoteTurn(config, payload.scope as NovaScope, content, `nova-eve:${runId}`)
  await prisma.$transaction(async (tx) => {
    const current = await tx.toolInvocation.findUniqueOrThrow({ where: { id: row.id } })
    const saved = current.result as unknown as EveProjectionState
    if (saved.runtimeSessionId && saved.runtimeSessionId !== id) throw new Error("Eve admission identity changed")
    await tx.toolInvocation.update({ where: { id: row.id }, data: { result: json({ ...saved, runtimeSessionId: id }), status: "executing", startedAt: current.startedAt ?? new Date() } })
    await tx.agentRun.updateMany({ where: { id: runId, status: "queued" }, data: { status: "executing", version: { increment: 1 } } })
  })
}

async function finish(tx: Prisma.TransactionClient, runId: string, payload: EveAdmissionPayload, outcome: "completed" | "failed" | "cancelled", state: EveProjectionState) {
  const run = await tx.agentRun.findUniqueOrThrow({ where: { id: runId } })
  if (terminal(run.status)) return
  const body = Object.values(state.replyParts).join("\n\n").trim()
  if (outcome === "completed" && !body) outcome = "failed"
  let artifact = ""
  if (outcome === "completed" && payload.repository) {
    const receipt = await tx.toolInvocation.findFirst({ where: { runId, capability: "nova-eve:repository", toolName: "repository_finish", status: "completed", result: { path: ["success"], equals: true } }, orderBy: { completedAt: "desc" }, select: { result: true } })
    if (!receipt) { outcome = "failed"; state.terminalError = "Repository work was not finalized against a verified diff. The task is incomplete." }
    else {
      const proof = receipt.result as unknown as { data?: { artifact?: string; digest?: string } }
      artifact = `\n\nVerified workspace digest: ${proof.data?.digest ?? "unavailable"}\n${proof.data?.artifact ?? "Patch artifact unavailable"}`
    }
  }
  const sequence = await tx.agentSession.update({ where: { id: run.agentSessionId }, data: { nextSequence: { increment: 1 } }, select: { nextSequence: true } })
  if (outcome === "completed") {
    await tx.agentSessionMessage.create({ data: { agentSessionId: run.agentSessionId, surfaceId: payload.surfaceId, sequence: sequence.nextSequence - 1, role: "assistant", content: body + artifact, senderType: "agent", metadata: json({ runId, runtime: "eve", provider: payload.scope.provider, model: payload.scope.model }) } })
  } else {
    await tx.agentActivity.create({ data: { agentSessionId: run.agentSessionId, surfaceId: payload.surfaceId, runId, sequence: sequence.nextSequence - 1, type: "error", status: outcome, title: outcome === "cancelled" ? "Eve run cancelled" : "Eve run did not complete", body: "The read-only canary did not produce a completed response." } })
  }
  await tx.agentRun.update({ where: { id: runId }, data: { status: outcome, completedAt: new Date(), version: { increment: 1 } } })
  await tx.agentSession.updateMany({ where: { id: run.agentSessionId, activeRunId: runId }, data: { activeRunId: null } })
  const prefix = `nova-eve:${runId}:event:999999999999:`
  if (outcome === "failed") await tx.toolInvocation.upsert({ where: { idempotencyKey: `${prefix}999998` }, update: {}, create: { runId, idempotencyKey: `${prefix}999998`, toolName: "eve_event", capability: "nova-eve:event", riskClass: "read", normalizedArgsHash: "v1", arguments: {}, status: "completed", result: json({ type: "error", message: state.terminalError ?? "Eve did not complete this read-only run. Check the connection or retry." }) } })
  await tx.toolInvocation.upsert({ where: { idempotencyKey: `${prefix}999999` }, update: {}, create: { runId, idempotencyKey: `${prefix}999999`, toolName: "eve_event", capability: "nova-eve:event", riskClass: "read", normalizedArgsHash: "v1", arguments: {}, status: "completed", result: json({ type: "finish", reason: outcome, runId, latestSequence: sequence.nextSequence - 1, model: payload.scope.model }) } })
  await tx.toolInvocation.updateMany({ where: { runId, capability: CAPABILITY }, data: { status: outcome === "completed" ? "completed" : "failed", completedAt: new Date() } })
}

export async function failEveRun(runId: string, outcome: "failed" | "cancelled" = "failed"): Promise<void> {
  const row = await load(runId)
  const payload = row.arguments as unknown as EveAdmissionPayload
  const state = row.result as unknown as EveProjectionState
  if (outcome === "failed" && !state.runtimeSessionId && row.startedAt) {
    state.terminalError = "Eve admission outcome is uncertain. The canary did not retry or duplicate it. Check this run before starting another."
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM agent_session WHERE id = ${row.run.agentSessionId} FOR UPDATE`
      await tx.toolInvocation.update({ where: { id: row.id }, data: { result: json(state), error: state.terminalError } })
      await finish(tx, runId, payload, "failed", state)
    }, { timeout: 20_000 })
    return
  }
  if (state.runtimeSessionId) await controlRemoteTurn(remoteConfig(), payload.scope as NovaScope, state.runtimeSessionId, "cancel")
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM agent_session WHERE id = ${row.run.agentSessionId} FOR UPDATE`
    await finish(tx, runId, payload, outcome, state)
  })
}

export async function observeEveRun(runId: string): Promise<{ terminal: boolean }> {
  const row = await load(runId)
  if (terminal(row.run.status)) return { terminal: true }
  const payload = row.arguments as unknown as EveAdmissionPayload
  const state = row.result as unknown as EveProjectionState
  if (Date.parse(payload.expiresAt) <= Date.now()) {
    await failEveRun(runId, "failed")
    return { terminal: true }
  }
  if (!state.runtimeSessionId) throw new Error("Eve session has not been admitted")
  const config = remoteConfig()
  if (row.run.cancellationAt) await controlRemoteTurn(config, payload.scope as NovaScope, state.runtimeSessionId, "cancel")
  const batch = await readRemoteBatch(config, payload.scope as NovaScope, state.runtimeSessionId, state.nextLine, state.nextIndex ?? -1)
  let ended = false
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM agent_session WHERE id = ${row.run.agentSessionId} FOR UPDATE`
    const current = await tx.toolInvocation.findUniqueOrThrow({ where: { id: row.id }, include: { run: true } })
    if (terminal(current.run.status)) { ended = true; return }
    const saved = current.result as unknown as EveProjectionState
    for (const event of batch.events) {
      const cursor = eventCursor(runId, event.meta.position.line, event.meta.position.index)
      if (await tx.toolInvocation.findUnique({ where: { idempotencyKey: cursor }, select: { id: true } })) continue
      if (event.type === "child.opened") {
        if (!payload.repository || process.env.NOVA_EVE_SPECIALISTS_ENABLED !== "true" || !isSpecialistRole(event.data.name) || !/^[A-Za-z0-9_-]{1,256}$/.test(event.data.sessionId) || event.data.stream !== `/eve/v1/session/${event.data.sessionId}/stream`) throw new Error("Unrecognized or remote specialist session")
        const count = await tx.toolInvocation.count({ where: { runId, capability: "nova-eve:specialist" } })
        if (count >= 6) throw new Error("Specialist delegation budget exhausted")
        await tx.toolInvocation.upsert({ where: { idempotencyKey: `nova-eve:specialist:${runId}:${event.data.sessionId}` }, update: {}, create: {
          runId, idempotencyKey: `nova-eve:specialist:${runId}:${event.data.sessionId}`, toolName: event.data.name,
          capability: "nova-eve:specialist", riskClass: "read", normalizedArgsHash: "v1", status: "completed",
          arguments: json({ role: event.data.name, parentRuntimeSessionId: state.runtimeSessionId, childRuntimeSessionId: event.data.sessionId }),
        } })
      }
      const projected = projectEveEvent(event, saved, Boolean(payload.repository))
      await tx.toolInvocation.create({ data: { runId, idempotencyKey: cursor, toolName: "eve_event", capability: "nova-eve:event", riskClass: "read", normalizedArgsHash: "v1", arguments: json({ sourceType: event.type }), status: "completed", result: projected.event ? json({ ...projected.event, runId }) : { type: "heartbeat" } } })
      if (projected.usage) await tx.novaUsageLedger.upsert({ where: { reservationKey: `${cursor}:usage` }, update: {}, create: { organizationId: payload.scope.organizationId, agentSessionId: row.run.agentSessionId, runId, kind: "inference", quantity: 0, unit: "credits", reservationKey: `${cursor}:usage`, metadata: json({ billing: "personal_account", provider: payload.scope.provider, model: payload.scope.model, ...projected.usage }) } })
      if (projected.event?.type === "status") {
        const sequence = await tx.agentSession.update({ where: { id: row.run.agentSessionId }, data: { nextSequence: { increment: 1 } }, select: { nextSequence: true } })
        await tx.agentActivity.create({ data: { agentSessionId: row.run.agentSessionId, surfaceId: payload.surfaceId, runId, sequence: sequence.nextSequence - 1, type: "progress", status: "working", title: "Eve · read-only", body: projected.event.message } })
      }
      if (projected.terminal) { await finish(tx, runId, payload, projected.terminal, saved); ended = true; break }
    }
    const advanced = batch.nextLine > saved.nextLine || batch.nextLine === saved.nextLine && batch.nextIndex > (saved.nextIndex ?? -1)
    await tx.toolInvocation.update({ where: { id: row.id }, data: { result: json({ ...saved, ...(advanced ? { nextLine: batch.nextLine, nextIndex: batch.nextIndex } : {}) }) } })
  }, { timeout: 20_000 })
  if (ended) await controlRemoteTurn(config, payload.scope as NovaScope, state.runtimeSessionId, "end").catch(() => {})
  return { terminal: ended }
}

export async function reconcileEveRuns(): Promise<number> {
  const rows = await prisma.toolInvocation.findMany({ where: { capability: CAPABILITY, status: { in: ["pending", "executing"] }, updatedAt: { lt: new Date(Date.now() - 60_000) }, run: { status: { notIn: ["completed", "failed", "cancelled"] } } }, select: { runId: true }, take: 50 })
  for (const row of rows) await inngest.send({ name: "nova/eve.dispatch.requested", id: `nova-eve:reconcile:${row.runId}:${Math.floor(Date.now() / 60_000)}`, data: { runId: row.runId } })
  return rows.length
}

import prisma, { type Prisma } from "@super/db"
import type { BridgeInput } from "./bridge"
import { ensureUserOrganization } from "@/modules/integrations/lib/org"
import type { JournalStore } from "./durable"

const json = (value: unknown) => JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue
const PREFIX = "nova-harness:"

export async function authorizeHarnessRun(userId: string, sessionId: string, runId: string) {
  const organizationId = await ensureUserOrganization(userId)
  const membership = await prisma.organizationMembership.findUnique({ where: { organizationId_userId: { organizationId, userId } } })
  if (membership?.status !== "active") throw new Error("Active membership required")
  const run = await prisma.agentRun.findFirst({ where: { id: runId, agentSessionId: sessionId, agentSession: { organizationId, initiatorMembershipId: membership.id } } })
  if (!run) throw new Error("Run not found")
  if (run.cancellationAt || ["cancelled", "failed", "completed"].includes(run.status)) throw new Error("Run is no longer resumable")
  const session = await prisma.agentSession.findUniqueOrThrow({ where: { id: sessionId } })
  if (session.activeRunId !== runId) throw new Error("Another turn superseded this run")
  return run
}

type Checkpoint = Pick<BridgeInput, "messages" | "tools" | "provider" | "model" | "mode">

export async function harnessCheckpoint(sessionId: string, runId: string, input: Checkpoint, resume: Record<string, unknown>, hasWorkspace: boolean): Promise<Checkpoint> {
  const workspace = hasWorkspace ? await prisma.novaSandboxSession.findFirstOrThrow({ where: { leaseRunId: runId }, select: { id: true, baseSha: true, provider: true, providerSandboxId: true } }) : null
  const existing = await prisma.toolInvocation.upsert({
    where: { idempotencyKey: `${PREFIX}${runId}:checkpoint` }, update: {},
    create: { runId, idempotencyKey: `${PREFIX}${runId}:checkpoint`, toolName: "checkpoint", capability: `${PREFIX}checkpoint`, riskClass: "state", normalizedArgsHash: "v1", arguments: json({ input, resume, workspace }), status: "completed" },
  })
  if (JSON.stringify(existing.arguments).length > 1_000_000) throw new Error("Turn checkpoint exceeds limits")
  const saved = existing.arguments as unknown as { input: Checkpoint; workspace: unknown }
  if (JSON.stringify(saved.workspace) !== JSON.stringify(workspace)) throw new Error("Workspace identity changed; automatic resume is unsafe")
  return saved.input
}

export async function resumeHarnessInput(userId: string, sessionId: string, runId: string) {
  const run = await authorizeHarnessRun(userId, sessionId, runId)
  if (run.status !== "awaiting_input") throw new Error("Run is not waiting for input")
  const unresolved = await prisma.toolInvocation.count({ where: { runId, capability: { startsWith: PREFIX }, status: { in: ["pending", "executing", "awaiting_input"] } } })
  if (unresolved) throw new Error("An interaction is pending or a tool outcome is uncertain")
  const checkpoint = await prisma.toolInvocation.findUniqueOrThrow({ where: { idempotencyKey: `${PREFIX}${runId}:checkpoint` } })
  const saved = checkpoint.arguments as unknown as { resume: Record<string, unknown> }
  return saved.resume
}

export function durableStore(sessionId: string, runId: string): JournalStore {
  return {
    async reserve(key, hash, name, args) {
      const row = await prisma.toolInvocation.upsert({
        where: { idempotencyKey: `${PREFIX}${runId}:${key}` }, update: {},
        create: { runId, idempotencyKey: `${PREFIX}${runId}:${key}`, toolName: name, capability: `${PREFIX}${name}`, riskClass: "bound", normalizedArgsHash: hash, arguments: json(args) },
      })
      return { id: row.id, hash: row.normalizedArgsHash, status: row.status, result: row.result }
    },
    async claim(id) {
      return prisma.$transaction(async (tx) => {
        const run = await tx.agentRun.findUniqueOrThrow({ where: { id: runId } })
        if (run.cancellationAt || run.status !== "executing") throw new Error("Run is not executing")
        const claim = await tx.toolInvocation.updateMany({ where: { id, runId, status: { in: ["pending", "approved"] } }, data: { status: "executing", startedAt: new Date() } })
        return claim.count === 1
      })
    },
    async finish(id, result) {
      const update = await prisma.toolInvocation.updateMany({ where: { id, runId, status: "executing" }, data: { status: "completed", result: json(result), completedAt: new Date() } })
      if (update.count !== 1) throw new Error("Invocation receipt changed")
    },
    async wait(id, kind, payload) {
      await prisma.$transaction(async (tx) => {
        const claim = await tx.toolInvocation.updateMany({ where: { id, runId, status: "pending" }, data: { status: "awaiting_input" } })
        if (claim.count !== 1) return
        const run = await tx.agentRun.updateMany({ where: { id: runId, status: "executing", cancellationAt: null }, data: { status: "awaiting_input", version: { increment: 1 } } })
        if (run.count !== 1) throw new Error("Run changed while requesting input")
        const invocation = await tx.toolInvocation.findUniqueOrThrow({ where: { id } })
        const sequence = await tx.agentSession.update({ where: { id: sessionId }, data: { nextSequence: { increment: 1 } } })
        await tx.agentActivity.create({ data: { agentSessionId: sessionId, runId, sequence: sequence.nextSequence - 1, type: "harness_interaction", status: "pending", title: kind === "question" ? "Nova has a question" : "Approval required", data: json({ invocationId: id, normalizedArgsHash: invocation.normalizedArgsHash, kind, payload, expiresAt: new Date(Date.now() + 86_400_000).toISOString() }) } })
      })
    },
  }
}

export async function decideHarnessInteraction(input: { userId: string; sessionId: string; runId: string; invocationId: string; hash: string; decision: "approve" | "deny" | "answer"; answers?: string[] }) {
  await authorizeHarnessRun(input.userId, input.sessionId, input.runId)
  return prisma.$transaction(async (tx) => {
    const invocation = await tx.toolInvocation.findFirst({ where: { id: input.invocationId, runId: input.runId, normalizedArgsHash: input.hash, capability: { startsWith: PREFIX } } })
    const activity = await tx.agentActivity.findFirst({ where: { runId: input.runId, type: "harness_interaction", data: { path: ["invocationId"], equals: input.invocationId } } })
    if (!invocation || !activity || invocation.status !== "awaiting_input") throw new Error("Interaction changed or already decided")
    const data = activity.data as Record<string, unknown>
    const expiry = Date.parse(String(data.expiresAt))
    if (!Number.isFinite(expiry) || expiry <= Date.now()) throw new Error("Interaction expired; start a new turn")
    const run = await tx.agentRun.findUniqueOrThrow({ where: { id: input.runId } })
    if (run.status !== "awaiting_input" || run.cancellationAt) throw new Error("Run no longer accepts decisions")
    const question = invocation.toolName === "question"
    if (question !== (input.decision === "answer") && input.decision !== "deny") throw new Error("Invalid interaction decision")
    if (question && input.decision === "answer") {
      const args = invocation.arguments as { questions?: unknown[] }
      if (!input.answers || input.answers.length !== args.questions?.length) throw new Error("Answer every question")
    }
    const completed = question || input.decision === "deny"
    const result = input.decision === "deny" ? { success: false, denied: true, error: "User denied this action" } : { success: true, answers: input.answers }
    const update = await tx.toolInvocation.updateMany({ where: { id: invocation.id, status: "awaiting_input" }, data: { status: completed ? "completed" : "approved", ...(completed ? { result: json(result), completedAt: new Date() } : {}) } })
    if (update.count !== 1) throw new Error("Interaction already decided")
    await tx.agentActivity.update({ where: { id: activity.id }, data: { status: input.decision, data: json({ ...data, decision: input.decision, decidedBy: input.userId }) } })
    return { runId: input.runId, status: "ready_to_resume" }
  })
}

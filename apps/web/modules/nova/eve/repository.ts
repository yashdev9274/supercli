import prisma, { type Prisma } from "@super/db"
import { authorizeNovaScope, verifyNovaScopeToken, type NovaScope } from "@super/nova-runtime/scope"
import { createPrismaScopeStore } from "@super/nova-runtime/store"
import { z } from "zod"
import { getEveAdmission, EveAdmissionError } from "./admission"
import { openSandboxWorkspace, sandboxEligibility } from "../sandbox/service"
import { sandboxProvider } from "../sandbox/policy"
import { executeRepositoryOperation, type RepositoryVerification } from "./repository-engine"
import { stableHash } from "../harness/durable"
import { SPECIALIST_ROLES, specialistCanUseTool } from "@super/nova-runtime/specialists"

const schema = z.object({ callId: z.string().min(1).max(200), runtimeSessionId: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/), specialistRole: z.enum(SPECIALIST_ROLES).optional(), name: z.enum(["read_file", "search_files", "read_instructions", "write_file", "edit_file", "run_command", "repository_verify", "repository_finish"]), args: z.record(z.string(), z.unknown()) }).strict()
const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
const hash = stableHash

export async function repositoryToolRequest(request: Request): Promise<Record<string, unknown>> {
  if (process.env.NOVA_EVE_ENABLED !== "true" || process.env.NOVA_EVE_REPOSITORY_ENABLED !== "true" || process.env.NOVA_SANDBOX_ENABLED !== "true") throw new EveAdmissionError("Repository execution disabled", 403)
  const token = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1]
  const scope = token && process.env.NOVA_EVE_SCOPE_SECRET ? verifyNovaScopeToken(token, { secret: process.env.NOVA_EVE_SCOPE_SECRET }) : null
  if (!scope?.repositoryRunId || !await authorizeNovaScope(scope, createPrismaScopeStore())) throw new EveAdmissionError("Repository scope denied", 403)
  if (!(process.env.NOVA_EVE_REPOSITORY_USER_IDS ?? "").split(",").map((value) => value.trim()).includes(scope.userId)) throw new EveAdmissionError("Repository execution is no longer enabled for this user", 403)
  const reader = request.body?.getReader()
  if (!reader) throw new EveAdmissionError("Repository operation body required", 400)
  let text = ""
  let bytes = 0
  const decoder = new TextDecoder("utf-8", { fatal: true })
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 160_000) throw new EveAdmissionError("Repository operation too large", 413)
      text += decoder.decode(chunk.value, { stream: true })
    }
    text += decoder.decode()
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  const operation = schema.parse(JSON.parse(text))
  const result = await executeScopedRepositoryTool(scope, operation)
  const data = result.data as Record<string, unknown> | undefined
  if (data && typeof data.diff === "string" && data.diff.length > 16_000) return { ...result, data: { ...data, diff: data.diff.slice(0, 16_000), diffTruncatedForDisplay: true } }
  return result
}

async function executeScopedRepositoryTool(scope: NovaScope, operation: z.infer<typeof schema>) {
  const runId = scope.repositoryRunId!
  let admitted = await getEveAdmission(scope.userId, scope.novaSessionId, runId)
  const payload = admitted.arguments
  if (!payload.repository || payload.scope.repositoryRunId !== runId || hash(payload.scope) !== hash(scope)) throw new EveAdmissionError("Repository grant does not match this turn", 403)
  let mapping = admitted.result as unknown as { runtimeSessionId?: string }
  for (let attempt = 0; !mapping.runtimeSessionId && attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    admitted = await getEveAdmission(scope.userId, scope.novaSessionId, runId)
    mapping = admitted.result as unknown as { runtimeSessionId?: string }
  }
  if (operation.specialistRole) {
    if (process.env.NOVA_EVE_SPECIALISTS_ENABLED !== "true" || !specialistCanUseTool(operation.specialistRole, operation.name)) throw new EveAdmissionError("Specialists have read-only repository permissions", 403)
    let child = null
    for (let attempt = 0; !child && attempt < 20; attempt++) {
      child = await prisma.toolInvocation.findFirst({ where: { runId, capability: "nova-eve:specialist", idempotencyKey: `nova-eve:specialist:${runId}:${operation.runtimeSessionId}` } })
      if (!child) await new Promise((resolve) => setTimeout(resolve, 250))
    }
    const identity = child?.arguments as { role?: string; parentRuntimeSessionId?: string } | undefined
    if (!identity || identity.role !== operation.specialistRole || identity.parentRuntimeSessionId !== mapping.runtimeSessionId) throw new EveAdmissionError("Specialist is not a recorded child of this Eve execution", 403)
  } else if (mapping.runtimeSessionId !== operation.runtimeSessionId) throw new EveAdmissionError("Repository tools require the recorded Eve execution identity", 409)
  const inputHash = hash([operation.name, operation.args])
  const key = `nova-eve:repository:${runId}:${hash([operation.runtimeSessionId, operation.callId])}`
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM agent_session WHERE id = ${scope.novaSessionId} FOR UPDATE`
    const run = await tx.agentRun.findUniqueOrThrow({ where: { id: runId } })
    const session = await tx.agentSession.findUniqueOrThrow({ where: { id: scope.novaSessionId } })
    if (run.status !== "executing" || run.cancellationAt || session.activeRunId !== runId || Date.parse(payload.expiresAt) <= Date.now()) throw new EveAdmissionError("Repository run is no longer executing", 409)
    const previous = await tx.toolInvocation.findUnique({ where: { idempotencyKey: key } })
    if (previous) {
      if (previous.normalizedArgsHash !== inputHash) throw new EveAdmissionError("Tool replay changed its arguments", 409)
      if (previous.status !== "completed") throw new EveAdmissionError("Repository tool outcome is uncertain; it will not be repeated", 409)
      return { receipt: previous, replayed: true, childId: "" }
    }
    const finished = await tx.toolInvocation.findFirst({ where: { runId, capability: "nova-eve:repository", toolName: "repository_finish", status: "completed", result: { path: ["success"], equals: true } } })
    if (finished) throw new EveAdmissionError("Repository task is already finalized; no further operations are allowed", 409)
    const uncertain = await tx.toolInvocation.count({ where: { runId, capability: "nova-eve:repository", status: "executing" } })
    if (uncertain) throw new EveAdmissionError("A repository operation is running or needs recovery", 409)
    const count = await tx.toolInvocation.count({ where: { runId, capability: "nova-eve:repository" } })
    if (count >= 40) throw new EveAdmissionError("Repository operation budget exhausted", 409)
    const child = await tx.agentRun.create({ data: { agentSessionId: scope.novaSessionId, parentRunId: runId, status: "executing", executionTarget: "remote_sandbox", policySnapshot: { source: "eve_repository_tool", operation: operation.name } } })
    const receipt = await tx.toolInvocation.create({ data: { runId, idempotencyKey: key, toolName: operation.name, capability: "nova-eve:repository", riskClass: "isolated_execution", normalizedArgsHash: inputHash, arguments: json({ args: operation.args, childId: child.id, sandboxProvider: sandboxProvider() }), status: "executing", startedAt: new Date() } })
    return { receipt, replayed: false, childId: child.id }
  })
  if (claimed.replayed) return claimed.receipt.result as Record<string, unknown>
  const deadline = AbortSignal.timeout(Math.max(1, Math.min(300_000, Date.parse(payload.expiresAt) - Date.now())))
  const cancellation = new AbortController()
  const signal = AbortSignal.any([deadline, cancellation.signal])
  const timer = setInterval(() => { void prisma.agentRun.findUnique({ where: { id: runId }, select: { cancellationAt: true, status: true } }).then((run) => { if (!run || run.cancellationAt || run.status !== "executing") cancellation.abort() }, () => cancellation.abort()) }, 2000)
  let workspace: Awaited<ReturnType<typeof openSandboxWorkspace>> | undefined
  let result: Record<string, unknown>
  try {
    const eligibility = await sandboxEligibility(scope.userId, scope.novaSessionId)
    if (!eligibility || eligibility.repositoryFullName !== payload.repository.repositoryFullName || eligibility.organizationId !== scope.organizationId) throw new Error("Authorized repository binding changed")
    const project = await prisma.agentSession.findUnique({ where: { id: scope.novaSessionId }, select: { localProjectId: true } })
    if (project?.localProjectId !== payload.repository.projectId || payload.repository.sandboxProvider !== sandboxProvider()) throw new Error("Workspace or sandbox provider changed")
    workspace = await openSandboxWorkspace({ ...eligibility, userId: scope.userId, sessionId: scope.novaSessionId, runId: claimed.childId, machineSize: "default", signal })
    const verified = await prisma.toolInvocation.findFirst({ where: { runId, capability: "nova-eve:repository", toolName: "repository_verify", status: "completed" }, orderBy: { completedAt: "desc" }, select: { result: true } })
    const verification = verified?.result as unknown as { success?: boolean; data?: { verifiedDigest: string; commands: Record<string, unknown>[] } } | undefined
    const proof: RepositoryVerification | undefined = verification?.success === true && verification.data ? { digest: verification.data.verifiedDigest, commands: verification.data.commands } : undefined
    result = await executeRepositoryOperation({ name: operation.name, args: operation.args, validationCommands: payload.repository.validationCommands, verified: proof }, workspace)
    await workspace.close()
    workspace = undefined
    await prisma.$transaction(async (tx) => {
      await tx.toolInvocation.update({ where: { id: claimed.receipt.id }, data: { status: "completed", result: json(result), completedAt: new Date() } })
      await tx.agentRun.update({ where: { id: claimed.childId }, data: { status: result.success === false ? "failed" : "completed", completedAt: new Date() } })
    })
    return result
  } catch {
    await workspace?.close().catch(() => {})
    await prisma.agentRun.updateMany({ where: { id: claimed.childId }, data: { status: "failed", completedAt: new Date() } }).catch(() => {})
    throw new EveAdmissionError("Repository operation failed or its outcome is uncertain; inspect this run before continuing. It will not be repeated automatically.", 409)
  } finally { clearInterval(timer) }
}

import { createHash } from "node:crypto"
import type prismaClient from "@super/db"
import type { Prisma } from "@super/db"
import { INTEGRATION_IDS, OPENAI_COMPATIBLE_BASE_URLS } from "@super/agent-runtime/integrations"
import { readScopedProviderConfig } from "@super/provider-runtime/store"
import { parseStoredProviderConfig } from "@super/provider-runtime/config"
import { configuredProviderVault } from "@super/provider-runtime/vault"
import { sandboxProvider } from "../sandbox/policy"
import { z } from "zod"

export class EveAdmissionError extends Error {
  constructor(message: string, public statusCode: number) {
    super(message)
    this.name = "EveAdmissionError"
  }
}

const inputSchema = z.object({
  userId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
  content: z.string().min(1).max(16000).refine((value) => Boolean(value.trim())),
  clientMessageId: z.string().trim().min(1).max(256),
  provider: z.string().min(1),
  model: z.string().trim().min(1).max(128).refine((value) => !/[\u0000-\u001f\u007f]/.test(value)),
  effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
  mode: z.enum(["chat", "plan", "agent"]),
  repository: z.object({ consent: z.literal(true), validationCommands: z.array(z.string().trim().min(1).max(2000)).min(1).max(3) }).strict().optional(),
  surface: z.enum(["web", "desktop"]),
}).strict()

export type EveAdmissionInput = z.input<typeof inputSchema>
export type EveAdmissionOptions = {
  prisma?: typeof prismaClient
  env?: Record<string, string | undefined>
  now?: () => Date
  readConfig?: typeof readScopedProviderConfig
}

const userMessageSchema = z.object({
  id: z.string(), sessionId: z.string(), surfaceId: z.string().nullable(),
  sequence: z.number().int(), role: z.literal("user"), content: z.string(),
  senderType: z.literal("member"), senderId: z.string(), createdAt: z.string(),
})
const argumentsSchema = z.object({
  version: z.literal(1),
  scope: z.object({
    organizationId: z.string(), userId: z.string(), membershipId: z.string(),
    novaSessionId: z.string(), provider: z.enum(INTEGRATION_IDS), model: z.string(),
    connectionId: z.string(), effort: inputSchema.shape.effort, repositoryRunId: z.string().optional(),
  }),
  content: z.string(), mode: z.enum(["chat", "plan", "agent"]), surface: z.enum(["web", "desktop"]),
  repository: z.object({ repositoryFullName: z.string(), projectId: z.string(), sandboxProvider: z.enum(["vercel", "e2b"]), validationCommands: z.array(z.string()) }).optional(),
  payloadHash: z.string(), history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })),
  surfaceId: z.string(), userMessage: userMessageSchema, expiresAt: z.string(),
})
export type EveAdmissionArguments = z.infer<typeof argumentsSchema>
export type EveAdmissionPayload = EveAdmissionArguments
export type EveAdmissionResult = {
  id: string
  runId: string
  userMessage: z.infer<typeof userMessageSchema>
  latestSequence: number
  replayed: boolean
}

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("base64url")
const terminalStatuses = ["completed", "failed", "cancelled"]

async function database(options: EveAdmissionOptions) {
  return options.prisma ?? (await import("@super/db")).default
}

async function authorize(db: Prisma.TransactionClient, userId: string, sessionId: string) {
  const session = await db.agentSession.findUnique({ where: { id: sessionId } })
  if (!session) throw new EveAdmissionError("Nova session not found", 404)
  const user = await db.user.findUnique({ where: { id: userId }, select: { organizationId: true } })
  const membership = await db.organizationMembership.findFirst({
    where: { id: session.initiatorMembershipId ?? "", userId, organizationId: session.organizationId, status: "active" },
    select: { id: true },
  })
  if (!membership || user?.organizationId !== session.organizationId) {
    throw new EveAdmissionError("Only the active session initiator can access this Eve turn", 403)
  }
  return { session, membership }
}

export async function admitEveTurn(raw: EveAdmissionInput, options: EveAdmissionOptions = {}): Promise<EveAdmissionResult> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) throw new EveAdmissionError("Eve requires text, a clientMessageId, and chat or plan mode; attachments and tools are not supported", 400)
  const input = parsed.data
  if ((input.mode === "agent") !== Boolean(input.repository)) throw new EveAdmissionError("Repository agent mode requires explicit workspace/compute consent and validation commands", 400)
  const env = options.env ?? process.env
  if (input.repository && (env.NOVA_EVE_REPOSITORY_ENABLED !== "true" || env.NOVA_SANDBOX_ENABLED !== "true" || !(env.NOVA_EVE_REPOSITORY_USER_IDS ?? "").split(",").map((value) => value.trim()).includes(input.userId))) throw new EveAdmissionError("Eve repository execution is not enabled for this user", 403)
  if (env.NOVA_EVE_CANARY_ENABLED !== "true"
    || !env.NOVA_EVE_CANARY_USER_IDS?.split(",").map((id) => id.trim()).includes(input.userId)) {
    throw new EveAdmissionError("Eve canary is not enabled for this user", 403)
  }
  if ((input.provider !== "codex" && !Object.hasOwn(OPENAI_COMPATIBLE_BASE_URLS, input.provider))
    || !env.NOVA_EVE_CANARY_PROVIDERS?.split(",").map((id) => id.trim()).includes(input.provider)) {
    throw new EveAdmissionError("This provider is not enabled for the read-only Eve canary; use Codex or an enabled personal OpenAI-compatible connection", 403)
  }
  if (input.provider !== "codex" && input.effort !== undefined) {
    throw new EveAdmissionError("OpenAI-compatible Eve providers do not support effort; omit it and retry", 400)
  }
  const db = await database(options)
  const now = options.now?.() ?? new Date()
  const payloadHash = hash([input.userId, input.sessionId, input.clientMessageId, input.content, input.provider, input.model, input.effort ?? null, input.mode, input.surface, ...(input.repository ? [input.repository] : [])])
  const idempotencyKey = `nova-eve:${input.sessionId}:${input.clientMessageId}`
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM agent_session WHERE id = ${input.sessionId} FOR UPDATE`
    const { session, membership } = await authorize(tx, input.userId, input.sessionId)
    const previous = await tx.toolInvocation.findUnique({ where: { idempotencyKey }, include: { run: true } })
    if (previous) {
      const saved = argumentsSchema.safeParse(previous.arguments)
      if (!saved.success || previous.capability !== "nova-eve:admission" || previous.run.agentSessionId !== session.id
        || saved.data.scope.userId !== input.userId || saved.data.scope.membershipId !== membership.id
        || saved.data.scope.organizationId !== session.organizationId || saved.data.scope.novaSessionId !== session.id
        || saved.data.payloadHash !== payloadHash) {
        throw new EveAdmissionError("clientMessageId was already used for a different Eve turn", 409)
      }
      return { id: previous.runId, runId: previous.runId, userMessage: saved.data.userMessage, latestSequence: saved.data.userMessage.sequence, replayed: true }
    }
    const active = await tx.agentRun.findFirst({ where: { agentSessionId: session.id, status: { notIn: terminalStatuses } }, select: { id: true } })
    if (active) throw new EveAdmissionError("A turn is already active in this session; wait or cancel it first", 409)
    let repository: EveAdmissionArguments["repository"]
    if (input.repository) {
      const project = await tx.webLocalProject.findFirst({ where: { id: session.localProjectId ?? "", organizationId: session.organizationId, userId: input.userId, status: "active" }, select: { id: true, repositoryFullName: true } })
      if (!project?.repositoryFullName) throw new EveAdmissionError("Select a connected GitHub project for repository execution", 403)
      const connected = await tx.repository.findFirst({ where: { userId: input.userId, organizationId: session.organizationId, fullName: project.repositoryFullName }, select: { id: true } })
      if (!connected) throw new EveAdmissionError("Repository authorization is missing", 403)
      repository = { repositoryFullName: project.repositoryFullName, projectId: project.id, sandboxProvider: sandboxProvider(), validationCommands: input.repository.validationCommands }
    }
    const owner = { id: membership.id, userId: input.userId, organizationId: session.organizationId, status: "active" }
    const connection = input.provider === "codex"
      ? await tx.novaCodexConnection.findFirst({
        where: { membershipId: membership.id, state: "connected", membership: owner },
        select: { connectedAt: true },
      })
      : await tx.novaProviderCredential.findFirst({
        where: { membershipId: membership.id, provider: input.provider, status: "connected", enabled: true, membership: owner },
        select: { updatedAt: true, encryptedApiKey: true },
      })
    const revision = connection && ("connectedAt" in connection ? connection.connectedAt : connection.updatedAt)
    if (!revision) throw new EveAdmissionError("Connect an enabled personal provider account before starting Eve", 403)
    const scope = {
      organizationId: session.organizationId, userId: input.userId, membershipId: membership.id,
      novaSessionId: session.id, provider: z.enum(INTEGRATION_IDS).parse(input.provider), model: input.model,
      connectionId: hash([membership.id, input.provider, revision.toISOString()]),
      ...(input.effort ? { effort: input.effort } : {}),
    }
    if (input.provider !== "codex") {
      try {
        let config
        if (options.readConfig) config = await options.readConfig(scope, env)
        else {
          if (!connection || !("encryptedApiKey" in connection)) throw new EveAdmissionError("Provider credential is unavailable", 403)
          const binding = JSON.stringify([scope.organizationId, scope.userId, scope.membershipId, scope.provider])
          config = parseStoredProviderConfig(configuredProviderVault(env).open(connection.encryptedApiKey, binding))
        }
        if (!config.apiKey?.trim() || (config.apiFamily && config.apiFamily !== "openai")) {
          throw new EveAdmissionError("Eve requires a personal OpenAI-compatible API key; reconnect this provider", 403)
        }
      } catch (error) {
        if (error instanceof EveAdmissionError) throw error
        throw new EveAdmissionError("Personal provider connection could not be verified; reconnect and retry", 403)
      }
    }
    const prior = await tx.agentSessionMessage.findMany({
      where: { agentSessionId: session.id, role: { in: ["user", "assistant"] } },
      orderBy: { sequence: "desc" }, take: 12, select: { role: true, content: true },
    })
    let remaining = 16000
    const history: EveAdmissionArguments["history"] = []
    for (const message of prior) {
      if (!remaining) break
      const text = message.content.slice(0, remaining)
      remaining -= text.length
      history.unshift({ role: message.role as "user" | "assistant", text })
    }
    const surface = await tx.sessionSurface.upsert({
      where: { surfaceKey: `nova-eve:${session.id}:${input.surface}` },
      create: { agentSessionId: session.id, provider: input.surface, surfaceKey: `nova-eve:${session.id}:${input.surface}`, externalSurfaceId: session.id, lastInboundAt: now },
      update: { lastInboundAt: now },
    })
    const run = await tx.agentRun.create({ data: {
      agentSessionId: session.id, executionTarget: "eve", status: "queued",
      policySnapshot: repository
        ? { readOnly: false, billing: "personal_account_plus_metered_sandbox", repositoryFullName: repository.repositoryFullName, sandbox: true, publication: false, mcp: false, consent: true }
        : { readOnly: true, billing: "personal_account", credits: 0, allowedTools: ["runtime_info"], sandbox: false, mcp: false },
      budget: { credits: 0 },
    } })
    if (repository) Object.assign(scope, { repositoryRunId: run.id })
    const message = await tx.agentSessionMessage.create({ data: {
      agentSessionId: session.id, surfaceId: surface.id, sequence: session.nextSequence,
      role: "user", content: input.content, senderType: "member", senderId: membership.id,
      externalId: input.clientMessageId, metadata: { runId: run.id, clientMessageId: input.clientMessageId, runtime: "eve" }, createdAt: now,
    } })
    const userMessage = {
      id: message.id, sessionId: session.id, surfaceId: surface.id, sequence: message.sequence,
      role: "user" as const, content: message.content, senderType: "member" as const, senderId: membership.id, createdAt: message.createdAt.toISOString(),
    }
    await tx.toolInvocation.create({ data: {
      runId: run.id, idempotencyKey, capability: "nova-eve:admission", toolName: "eve_admission", riskClass: "read",
      normalizedArgsHash: payloadHash, status: "pending",
      arguments: { version: 1, scope, content: input.content, mode: input.mode, ...(repository ? { repository } : {}), surface: input.surface, payloadHash, history, surfaceId: surface.id, userMessage, expiresAt: new Date(now.getTime() + 15 * 60 * 1000).toISOString() },
      result: { runtimeSessionId: null, nextLine: 0, replyParts: {} },
    } })
    await tx.agentSession.update({ where: { id: session.id }, data: { activeRunId: run.id, nextSequence: { increment: 1 } } })
    return { id: run.id, runId: run.id, userMessage, latestSequence: message.sequence, replayed: false }
  })
}

export async function getEveAdmission(userId: string, sessionId: string, runId: string, options: EveAdmissionOptions = {}) {
  const db = await database(options)
  const { session, membership } = await authorize(db, userId, sessionId)
  const invocation = await db.toolInvocation.findFirst({
    where: { runId, capability: "nova-eve:admission", toolName: "eve_admission", run: { agentSessionId: sessionId, executionTarget: "eve" } },
    include: { run: true },
  })
  const parsed = argumentsSchema.safeParse(invocation?.arguments)
  if (!invocation || !parsed.success || parsed.data.scope.userId !== userId
    || parsed.data.scope.membershipId !== membership.id || parsed.data.scope.organizationId !== session.organizationId
    || parsed.data.scope.novaSessionId !== sessionId) throw new EveAdmissionError("Eve admission not found", 404)
  return { ...invocation, arguments: parsed.data, scope: parsed.data.scope }
}

export async function currentEveAdmission(userId: string, sessionId: string, options: EveAdmissionOptions = {}) {
  const db = await database(options)
  const { session } = await authorize(db, userId, sessionId)
  if (!session.activeRunId) return null
  const row = await db.toolInvocation.findFirst({ where: { runId: session.activeRunId, capability: "nova-eve:admission", run: { agentSessionId: sessionId, executionTarget: "eve" } }, select: { runId: true } })
  return row ? getEveAdmission(userId, sessionId, row.runId, options) : null
}

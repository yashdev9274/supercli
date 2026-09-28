import { z } from "zod"

export const NOVA_CONTRACT_VERSION = "1" as const

export const novaProviderSchema = z.enum([
  "desktop",
  "web",
  "slack",
  "linear",
  "github",
])

export const connectorHealthSchema = z.enum([
  "pending",
  "healthy",
  "permission_missing",
  "unhealthy",
  "revoked",
])

export const webhookHealthSchema = z.enum([
  "pending",
  "healthy",
  "failing",
  "disabled",
])

export const botInstallationSchema = z.object({
  contractVersion: z.literal(NOVA_CONTRACT_VERSION),
  id: z.string().min(1),
  provider: novaProviderSchema.exclude(["desktop", "web"]),
  externalAccountId: z.string().min(1),
  externalAccountName: z.string().nullable(),
  botExternalUserId: z.string().nullable(),
  health: connectorHealthSchema,
  webhookHealth: webhookHealthSchema,
  grantedScopes: z.array(z.string()),
  missingScopes: z.array(z.string()),
  canReceiveMessages: z.boolean(),
  canReplyAsNova: z.boolean(),
  lastHealthCheckAt: z.string().datetime().nullable(),
  lastEventAt: z.string().datetime().nullable(),
})

export const userDelegatedConnectionSchema = z.object({
  contractVersion: z.literal(NOVA_CONTRACT_VERSION),
  id: z.string().min(1),
  provider: novaProviderSchema.exclude(["desktop", "web"]),
  externalAccountId: z.string().min(1),
  grantedScopes: z.array(z.string()),
  status: z.enum(["active", "expired", "revoked"]),
  expiresAt: z.string().datetime().nullable(),
})

export const connectorStatusSchema = z.object({
  provider: novaProviderSchema.exclude(["desktop", "web"]),
  botInstallation: botInstallationSchema.nullable(),
  delegatedConnection: userDelegatedConnectionSchema.nullable(),
  ready: z.boolean(),
  statusMessage: z.string().nullable(),
  authorizeUrl: z.string().url().nullable(),
  testConversationUrl: z.string().url().nullable(),
})

export const agentSessionStatusSchema = z.enum([
  "active",
  "sleeping",
  "completed",
  "cancelled",
  "failed",
])

export const agentRunStatusSchema = z.enum([
  "queued",
  "acknowledging",
  "gathering_context",
  "planning",
  "awaiting_approval",
  "executing",
  "verifying",
  "delivering",
  "completed",
  "failed",
  "cancelled",
])

export const executionTargetSchema = z.enum([
  "none",
  "desktop",
  "remote_sandbox",
])

export const agentActivityTypeSchema = z.enum([
  "acknowledgement",
  "plan",
  "action",
  "approval_request",
  "response",
  "error",
  "result",
])

export const sessionSurfaceSchema = z.object({
  id: z.string().min(1),
  provider: novaProviderSchema,
  externalSurfaceId: z.string().min(1),
  externalContainerId: z.string().nullable(),
  externalUrl: z.string().url().nullable(),
  status: z.enum(["active", "muted", "archived"]),
})

export const sessionMessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  surfaceId: z.string().nullable(),
  sequence: z.number().int().positive(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.string(),
  senderType: z.enum(["member", "external_user", "nova", "system"]).nullable(),
  senderId: z.string().nullable(),
  createdAt: z.string().datetime(),
})

export const agentActivitySchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().nullable(),
  sequence: z.number().int().positive(),
  type: agentActivityTypeSchema,
  status: z.string().min(1),
  title: z.string().nullable(),
  body: z.string().nullable(),
  data: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string().datetime(),
})

export const agentSessionSummarySchema = z.object({
  contractVersion: z.literal(NOVA_CONTRACT_VERSION),
  id: z.string().min(1),
  objective: z.string(),
  mode: z.string(),
  status: agentSessionStatusSchema,
  activeRunId: z.string().nullable(),
  latestSequence: z.number().int().nonnegative(),
  surfaces: z.array(sessionSurfaceSchema),
  updatedAt: z.string().datetime(),
})

export const normalizedInboundEventSchema = z.object({
  contractVersion: z.literal(NOVA_CONTRACT_VERSION),
  organizationId: z.string().min(1),
  installationId: z.string().nullable(),
  provider: novaProviderSchema,
  providerDeliveryId: z.string().min(1),
  eventType: z.string().min(1),
  actorExternalId: z.string().nullable(),
  surface: z.object({
    externalSurfaceId: z.string().min(1),
    externalContainerId: z.string().nullable(),
  }).nullable(),
  occurredAt: z.string().datetime(),
  payload: z.record(z.string(), z.unknown()),
})

export const conversationalMutationToolSchema = z.enum([
  "slack.reply",
  "linear.reply",
  "github.comment",
])

const mutationBaseArgumentsSchema = z.object({
  surfaceId: z.string().min(1),
  text: z.string().trim().min(1).max(8_000),
})

export const slackReplyArgumentsSchema = mutationBaseArgumentsSchema.extend({
  channelId: z.string().min(1),
  threadTimestamp: z.string().min(1),
}).strict()

export const linearReplyArgumentsSchema = mutationBaseArgumentsSchema.extend({
  agentSessionId: z.string().min(1),
}).strict()

export const githubCommentArgumentsSchema = mutationBaseArgumentsSchema.extend({
  repository: z.string().regex(/^[^/\s]+\/[^/\s]+$/),
  issueNumber: z.number().int().safe().positive(),
}).strict()

export const mutationArgumentsSchema = z.discriminatedUnion("tool", [
  z.object({ tool: z.literal("slack.reply"), arguments: slackReplyArgumentsSchema }),
  z.object({ tool: z.literal("linear.reply"), arguments: linearReplyArgumentsSchema }),
  z.object({ tool: z.literal("github.comment"), arguments: githubCommentArgumentsSchema }),
])

export const mutationPreviewSchema = z.discriminatedUnion("tool", [
  z.object({
    tool: z.literal("slack.reply"),
    text: z.string(),
    target: z.object({ channelId: z.string(), threadTimestamp: z.string() }),
  }),
  z.object({
    tool: z.literal("linear.reply"),
    text: z.string(),
    target: z.object({ agentSessionId: z.string() }),
  }),
  z.object({
    tool: z.literal("github.comment"),
    text: z.string(),
    target: z.object({ repository: z.string(), issueNumber: z.number().int().positive() }),
  }),
])

export const mutationProposalSchema = z.object({
  kind: z.literal("mutation_proposal"),
  tool: conversationalMutationToolSchema,
  text: z.string().trim().min(1).max(8_000),
  summary: z.string().trim().min(1).max(500),
})

export const conversationalRunOutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("response"),
    text: z.string().trim().min(1).max(8_000),
  }),
  mutationProposalSchema,
])

export const approvalStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "cancelled",
])

export const approvalRequestSchema = z.object({
  contractVersion: z.literal(NOVA_CONTRACT_VERSION),
  id: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolInvocationId: z.string().nullable(),
  capability: z.string().min(1),
  normalizedArgsHash: z.string().min(1),
  mutation: mutationPreviewSchema.nullable(),
  status: approvalStatusSchema,
  expiresAt: z.string().datetime(),
  decidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

export const approvalDecisionInputSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  toolInvocationId: z.string().min(1).nullable(),
  capability: z.string().min(1),
  normalizedArgsHash: z.string().min(1),
})

export const approvalListSchema = z.object({
  contractVersion: z.literal(NOVA_CONTRACT_VERSION),
  approvals: z.array(approvalRequestSchema),
})

export const syncCursorSchema = z.object({
  contractVersion: z.literal(NOVA_CONTRACT_VERSION),
  sessionId: z.string().min(1),
  afterSequence: z.number().int().nonnegative(),
  messages: z.array(sessionMessageSchema),
  activities: z.array(agentActivitySchema),
  nextSequence: z.number().int().nonnegative(),
  hasMore: z.boolean(),
})

export const desktopExecutionLeaseSchema = z.object({
  contractVersion: z.literal(NOVA_CONTRACT_VERSION),
  leaseId: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().min(1),
  deviceId: z.string().min(1),
  workspaceBindingId: z.string().min(1),
  capabilities: z.array(z.string()).min(1),
  constraints: z.record(z.string(), z.unknown()),
  expiresAt: z.string().datetime(),
  token: z.string().min(32),
})

export type NovaProvider = z.infer<typeof novaProviderSchema>
export type ConnectorStatus = z.infer<typeof connectorStatusSchema>
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>
export type ExecutionTarget = z.infer<typeof executionTargetSchema>
export type NormalizedInboundEvent = z.infer<typeof normalizedInboundEventSchema>
export type AgentSessionSummary = z.infer<typeof agentSessionSummarySchema>
export type ConversationalMutationTool = z.infer<typeof conversationalMutationToolSchema>
export type MutationProposal = z.infer<typeof mutationProposalSchema>
export type SlackReplyArguments = z.infer<typeof slackReplyArgumentsSchema>
export type LinearReplyArguments = z.infer<typeof linearReplyArgumentsSchema>
export type GitHubCommentArguments = z.infer<typeof githubCommentArgumentsSchema>
export type MutationArguments = z.infer<typeof mutationArgumentsSchema>["arguments"]
export type MutationPreview = z.infer<typeof mutationPreviewSchema>
export type ConversationalRunOutput = z.infer<typeof conversationalRunOutputSchema>
export type ApprovalRequest = z.infer<typeof approvalRequestSchema>
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionInputSchema>
export type ApprovalList = z.infer<typeof approvalListSchema>
export type SyncCursor = z.infer<typeof syncCursorSchema>
export type DesktopExecutionLease = z.infer<typeof desktopExecutionLeaseSchema>

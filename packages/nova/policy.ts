import type { AgentRunStatus } from "./contracts"

const TERMINAL_RUN_STATUSES = new Set<AgentRunStatus>([
  "completed",
  "failed",
  "cancelled",
])

const RUN_TRANSITIONS: Record<AgentRunStatus, ReadonlySet<AgentRunStatus>> = {
  queued: new Set(["acknowledging", "cancelled", "failed"]),
  acknowledging: new Set(["gathering_context", "cancelled", "failed"]),
  gathering_context: new Set(["planning", "cancelled", "failed"]),
  planning: new Set(["awaiting_approval", "executing", "delivering", "cancelled", "failed"]),
  awaiting_approval: new Set(["executing", "cancelled", "failed"]),
  executing: new Set(["awaiting_approval", "verifying", "cancelled", "failed"]),
  verifying: new Set(["executing", "delivering", "cancelled", "failed"]),
  delivering: new Set(["completed", "cancelled", "failed"]),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
}

export function canTransitionRun(
  from: AgentRunStatus,
  to: AgentRunStatus,
): boolean {
  return RUN_TRANSITIONS[from].has(to)
}

export function assertRunTransition(
  from: AgentRunStatus,
  to: AgentRunStatus,
): void {
  if (!canTransitionRun(from, to)) {
    throw new Error(`Invalid Nova run transition: ${from} -> ${to}`)
  }
}

export function isTerminalRunStatus(status: AgentRunStatus): boolean {
  return TERMINAL_RUN_STATUSES.has(status)
}

export function isBotConnectorReady(input: {
  status: string
  webhookStatus: string
  canReceiveMessages: boolean
  canReplyAsNova: boolean
  missingScopes: readonly string[]
}): boolean {
  return input.status === "active" &&
    input.webhookStatus === "healthy" &&
    input.canReceiveMessages &&
    input.canReplyAsNova &&
    input.missingScopes.length === 0
}

export function requiresApproval(input: {
  capability: string
  riskClass: "read" | "write" | "destructive" | "privileged"
  executionTarget: "none" | "desktop" | "remote_sandbox"
}): boolean {
  if (input.riskClass !== "read") return true
  if (input.executionTarget === "desktop" && input.capability === "run_command") {
    return true
  }
  return false
}

export function mayDecideApproval(input: {
  membershipId: string
  membershipRole: string
  initiatorMembershipId: string | null
  approverMembershipId: string | null
}): boolean {
  if (input.approverMembershipId) {
    return input.approverMembershipId === input.membershipId
  }
  return input.initiatorMembershipId === input.membershipId ||
    input.membershipRole === "owner" ||
    input.membershipRole === "admin"
}

export function approvalBindingsMatch(
  approval: {
    sessionId: string
    runId: string
    toolInvocationId: string | null
    capability: string
    normalizedArgsHash: string
  },
  decision: {
    sessionId: string
    runId: string
    toolInvocationId: string | null
    capability: string
    normalizedArgsHash: string
  },
): boolean {
  return approval.sessionId === decision.sessionId &&
    approval.runId === decision.runId &&
    approval.toolInvocationId === decision.toolInvocationId &&
    approval.capability === decision.capability &&
    approval.normalizedArgsHash === decision.normalizedArgsHash
}

export function approvalContinuationIsTerminal(input: {
  denied: boolean
  replayed: boolean
  runStatus: string
}): boolean {
  return input.denied || (input.replayed && input.runStatus === "completed")
}

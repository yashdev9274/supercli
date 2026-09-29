import { describe, expect, test } from "bun:test"
import {
  botInstallationSchema,
  approvalBindingsMatch,
  approvalContinuationIsTerminal,
  canTransitionRun,
  desktopExecutionLeaseSchema,
  isBotConnectorReady,
  mayDecideApproval,
  requiresApproval,
} from "./index"

describe("Nova run state machine", () => {
  test("allows durable forward transitions and cancellation", () => {
    expect(canTransitionRun("queued", "acknowledging")).toBe(true)
    expect(canTransitionRun("planning", "awaiting_approval")).toBe(true)
    expect(canTransitionRun("executing", "verifying")).toBe(true)
    expect(canTransitionRun("verifying", "executing")).toBe(true)
    expect(canTransitionRun("delivering", "completed")).toBe(true)
    expect(canTransitionRun("executing", "cancelled")).toBe(true)
  })

  test("rejects terminal and skipped transitions", () => {
    expect(canTransitionRun("queued", "completed")).toBe(false)
    expect(canTransitionRun("completed", "executing")).toBe(false)
    expect(canTransitionRun("cancelled", "queued")).toBe(false)
  })
})

describe("Nova approval policy", () => {
  const binding = {
    sessionId: "session_1",
    runId: "run_1",
    toolInvocationId: "tool_1",
    capability: "github.comment",
    normalizedArgsHash: "hash_1",
  }

  test("authorizes only the assignee when an approval is assigned", () => {
    expect(mayDecideApproval({
      membershipId: "member_1",
      membershipRole: "owner",
      initiatorMembershipId: "member_1",
      approverMembershipId: "member_2",
    })).toBe(false)
    expect(mayDecideApproval({
      membershipId: "member_2",
      membershipRole: "member",
      initiatorMembershipId: "member_1",
      approverMembershipId: "member_2",
    })).toBe(true)
  })

  test("authorizes the initiator and active privileged roles for unassigned approvals", () => {
    expect(mayDecideApproval({
      membershipId: "member_1",
      membershipRole: "member",
      initiatorMembershipId: "member_1",
      approverMembershipId: null,
    })).toBe(true)
    expect(mayDecideApproval({
      membershipId: "admin_1",
      membershipRole: "admin",
      initiatorMembershipId: "member_1",
      approverMembershipId: null,
    })).toBe(true)
    expect(mayDecideApproval({
      membershipId: "member_2",
      membershipRole: "member",
      initiatorMembershipId: "member_1",
      approverMembershipId: null,
    })).toBe(false)
  })

  test("rejects every changed approval binding", () => {
    expect(approvalBindingsMatch(binding, binding)).toBe(true)
    for (const key of Object.keys(binding) as Array<keyof typeof binding>) {
      expect(approvalBindingsMatch(binding, { ...binding, [key]: `changed_${key}` })).toBe(false)
    }
  })

  test("resumes interrupted execution replays but stops denials and completed replays", () => {
    expect(approvalContinuationIsTerminal({
      denied: true,
      replayed: false,
      runStatus: "cancelled",
    })).toBe(true)
    expect(approvalContinuationIsTerminal({
      denied: false,
      replayed: true,
      runStatus: "verifying",
    })).toBe(false)
    expect(approvalContinuationIsTerminal({
      denied: false,
      replayed: true,
      runStatus: "completed",
    })).toBe(true)
  })
})

describe("Nova connector policy", () => {
  test("requires both healthy inbound and Nova-authored outbound messaging", () => {
    expect(isBotConnectorReady({
      status: "active",
      webhookStatus: "healthy",
      canReceiveMessages: true,
      canReplyAsNova: true,
      missingScopes: [],
    })).toBe(true)

    expect(isBotConnectorReady({
      status: "active",
      webhookStatus: "healthy",
      canReceiveMessages: true,
      canReplyAsNova: false,
      missingScopes: ["chat:write"],
    })).toBe(false)
  })

  test("keeps chat permission separate from mutation approval", () => {
    expect(requiresApproval({
      capability: "reply_as_nova",
      riskClass: "read",
      executionTarget: "none",
    })).toBe(false)
    expect(requiresApproval({
      capability: "update_issue",
      riskClass: "write",
      executionTarget: "none",
    })).toBe(true)
    expect(requiresApproval({
      capability: "run_command",
      riskClass: "read",
      executionTarget: "desktop",
    })).toBe(true)
  })
})

describe("Nova versioned contracts", () => {
  test("accepts a healthy native bot installation", () => {
    expect(botInstallationSchema.parse({
      contractVersion: "1",
      id: "install_1",
      provider: "slack",
      externalAccountId: "T123",
      externalAccountName: "Acme",
      botExternalUserId: "U_NOVA",
      health: "healthy",
      webhookHealth: "healthy",
      grantedScopes: ["app_mentions:read", "chat:write"],
      missingScopes: [],
      canReceiveMessages: true,
      canReplyAsNova: true,
      lastHealthCheckAt: null,
      lastEventAt: null,
    }).provider).toBe("slack")
  })

  test("requires short-lived desktop leases to be strongly identified", () => {
    expect(() => desktopExecutionLeaseSchema.parse({
      contractVersion: "1",
      leaseId: "lease_1",
      sessionId: "session_1",
      runId: "run_1",
      deviceId: "device_1",
      workspaceBindingId: "workspace_1",
      capabilities: ["read_file"],
      constraints: {},
      expiresAt: new Date().toISOString(),
      token: "too-short",
    })).toThrow()
  })
})

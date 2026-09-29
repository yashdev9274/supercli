import prisma from "@super/db"
import {
  NOVA_CONTRACT_VERSION,
  approvalBindingsMatch,
  mayDecideApproval,
  mutationPreview,
  type ApprovalDecisionInput,
  type ApprovalList,
  type ApprovalRequest,
} from "@super/nova"

import { publishApprovalContinuation } from "@/modules/nova/mutations/service"

const MAX_APPROVALS = 100

export class ApprovalServiceError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "conflict" | "expired",
  ) {
    super(message)
    this.name = "ApprovalServiceError"
  }
}

type ApprovalRecord = {
  id: string
  runId: string
  toolInvocationId: string | null
  capability: string
  normalizedArgsHash: string
  status: string
  expiresAt: Date
  decidedAt: Date | null
  createdAt: Date
  run: {
    status: string
    agentSessionId: string
    agentSession: {
      organizationId: string
      initiatorMembershipId: string | null
    }
  }
  toolInvocation: {
    id: string
    runId: string
    toolName: string
    capability: string
    normalizedArgsHash: string
    arguments: unknown
    status: string
  } | null
}

function serializeApproval(approval: ApprovalRecord): ApprovalRequest {
  return {
    contractVersion: NOVA_CONTRACT_VERSION,
    id: approval.id,
    sessionId: approval.run.agentSessionId,
    runId: approval.runId,
    toolInvocationId: approval.toolInvocationId,
    capability: approval.capability,
    normalizedArgsHash: approval.normalizedArgsHash,
    mutation: approval.toolInvocation
      ? mutationPreview(
          conversationalTool(approval.toolInvocation.toolName),
          approval.toolInvocation.arguments,
        )
      : null,
    status: approval.status as ApprovalRequest["status"],
    expiresAt: approval.expiresAt.toISOString(),
    decidedAt: approval.decidedAt?.toISOString() ?? null,
    createdAt: approval.createdAt.toISOString(),
  }
}

async function approvalContext(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  })
  const organizationId = user?.organizationId
  if (!organizationId) {
    throw new ApprovalServiceError("Active organization membership required", "forbidden")
  }
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
  })
  if (!membership || membership.status !== "active") {
    throw new ApprovalServiceError("Active organization membership required", "forbidden")
  }
  return { organizationId, membership }
}

function conversationalTool(toolName: string) {
  if (toolName === "slack.reply" || toolName === "linear.reply" || toolName === "github.comment") {
    return toolName
  }
  throw new ApprovalServiceError("Approval contains an unsupported mutation", "conflict")
}

function assertDecisionBindings(approval: ApprovalRecord, input: ApprovalDecisionInput) {
  if (!approvalBindingsMatch({
    sessionId: approval.run.agentSessionId,
    runId: approval.runId,
    toolInvocationId: approval.toolInvocationId,
    capability: approval.capability,
    normalizedArgsHash: approval.normalizedArgsHash,
  }, input)) {
    throw new ApprovalServiceError("Approval bindings changed", "conflict")
  }
}

export async function listApprovals(userId: string): Promise<ApprovalList> {
  const now = new Date()
  const { organizationId, membership } = await approvalContext(userId)

  await prisma.$transaction(async (tx) => {
    const expired = await tx.approvalRequest.findMany({
      where: {
        status: "pending",
        expiresAt: { lte: now },
        run: { agentSession: { organizationId } },
        OR: [
          { approverMembershipId: membership.id },
          {
            approverMembershipId: null,
            run: { agentSession: { initiatorMembershipId: membership.id } },
          },
          ...(["owner", "admin"].includes(membership.role) ? [{ approverMembershipId: null }] : []),
        ],
      },
      select: {
        id: true,
        runId: true,
        toolInvocationId: true,
        run: { select: { agentSessionId: true } },
      },
      take: MAX_APPROVALS,
    })

    if (expired.length === 0) return

    const expiredApprovalIds = expired.map((approval) => approval.id)
    const expiredRunIds = [...new Set(expired.map((approval) => approval.runId))]
    const expiredInvocationIds = expired.flatMap((approval) =>
      approval.toolInvocationId ? [approval.toolInvocationId] : [],
    )
    await tx.approvalRequest.updateMany({
      where: { id: { in: expiredApprovalIds }, status: "pending", expiresAt: { lte: now } },
      data: { status: "expired", decidedAt: now },
    })
    if (expiredInvocationIds.length > 0) {
      await tx.toolInvocation.updateMany({
        where: { id: { in: expiredInvocationIds }, status: "awaiting_approval" },
        data: { status: "expired", completedAt: now },
      })
    }
    await tx.agentRun.updateMany({
      where: { id: { in: expiredRunIds }, status: "awaiting_approval" },
      data: { status: "cancelled", version: { increment: 1 }, completedAt: now },
    })
    for (const approval of expired) {
      await tx.agentSession.updateMany({
        where: { id: approval.run.agentSessionId, activeRunId: approval.runId },
        data: { activeRunId: null },
      })
    }
    await tx.novaAuditEvent.createMany({
      data: expired.map((approval) => ({
        organizationId,
        agentSessionId: approval.run.agentSessionId,
        actorType: "system",
        action: "nova.approval.expire",
        resourceType: "approval_request",
        resourceId: approval.id,
        decision: "expired",
        metadata: { runId: approval.runId },
      })),
    })
  })

  const approvals = await prisma.approvalRequest.findMany({
    where: {
      run: { agentSession: { organizationId } },
      OR: [
        { approverMembershipId: membership.id },
        {
          approverMembershipId: null,
          run: { agentSession: { initiatorMembershipId: membership.id } },
        },
        ...(["owner", "admin"].includes(membership.role) ? [{ approverMembershipId: null }] : []),
      ],
    },
    include: { run: { include: { agentSession: true } }, toolInvocation: true },
    orderBy: { createdAt: "desc" },
    take: MAX_APPROVALS,
  })

  return {
    contractVersion: NOVA_CONTRACT_VERSION,
    approvals: approvals.map(serializeApproval),
  }
}

export async function expirePendingApprovals(limit = 100): Promise<number> {
  const now = new Date()
  return prisma.$transaction(async (tx) => {
    const expired = await tx.approvalRequest.findMany({
      where: { status: "pending", expiresAt: { lte: now } },
      include: { run: { include: { agentSession: true } } },
      orderBy: { expiresAt: "asc" },
      take: Math.min(Math.max(limit, 1), 500),
    })
    let count = 0
    for (const approval of expired) {
      const updated = await tx.approvalRequest.updateMany({
        where: { id: approval.id, status: "pending", expiresAt: { lte: now } },
        data: { status: "expired", decidedAt: now },
      })
      if (updated.count !== 1) continue
      count += 1
      if (approval.toolInvocationId) {
        await tx.toolInvocation.updateMany({
          where: { id: approval.toolInvocationId, status: "awaiting_approval" },
          data: { status: "expired", completedAt: now },
        })
      }
      await tx.agentRun.updateMany({
        where: { id: approval.runId, status: "awaiting_approval" },
        data: { status: "cancelled", version: { increment: 1 }, completedAt: now },
      })
      await tx.agentSession.updateMany({
        where: { id: approval.run.agentSessionId, activeRunId: approval.runId },
        data: { activeRunId: null },
      })
      await tx.novaAuditEvent.create({
        data: {
          organizationId: approval.run.agentSession.organizationId,
          agentSessionId: approval.run.agentSessionId,
          actorType: "system",
          action: "nova.approval.expire",
          resourceType: "approval_request",
          resourceId: approval.id,
          decision: "expired",
          metadata: { runId: approval.runId },
        },
      })
    }
    return count
  })
}

export async function decideApproval(input: {
  userId: string
  approvalId: string
  decision: ApprovalDecisionInput
}): Promise<ApprovalRequest> {
  const now = new Date()
  const { organizationId, membership } = await approvalContext(input.userId)

  const result = await prisma.$transaction(async (tx) => {
    const approval = await tx.approvalRequest.findFirst({
      where: {
        id: input.approvalId,
        run: { agentSession: { organizationId } },
      },
      include: { run: { include: { agentSession: true } }, toolInvocation: true },
    })
    if (!approval) throw new ApprovalServiceError("Approval not found", "not_found")
    if (!mayDecideApproval({
      membershipId: membership.id,
      membershipRole: membership.role,
      initiatorMembershipId: approval.run.agentSession.initiatorMembershipId,
      approverMembershipId: approval.approverMembershipId,
    })) {
      throw new ApprovalServiceError("Approval is assigned to another member", "forbidden")
    }
    assertDecisionBindings(approval, input.decision)

    if (
      approval.status === input.decision.decision &&
      approval.approverMembershipId === membership.id
    ) {
      return {
        expired: false as const,
        approval: serializeApproval(approval),
        continuationOutboxId: null,
      }
    }
    if (approval.status !== "pending") {
      throw new ApprovalServiceError(`Approval is already ${approval.status}`, "conflict")
    }
    if (
      approval.run.status !== "awaiting_approval" ||
      !approval.toolInvocation ||
      approval.toolInvocation.runId !== approval.runId ||
      approval.toolInvocation.status !== "awaiting_approval" ||
      approval.toolInvocation.capability !== approval.capability ||
      approval.toolInvocation.normalizedArgsHash !== approval.normalizedArgsHash
    ) {
      throw new ApprovalServiceError("Approval target is no longer awaiting approval", "conflict")
    }
    if (approval.expiresAt <= now) {
      const expired = await tx.approvalRequest.updateMany({
        where: { id: approval.id, status: "pending", expiresAt: { lte: now } },
        data: { status: "expired", decidedAt: now },
      })
      if (expired.count === 1) {
        if (approval.toolInvocationId) {
          await tx.toolInvocation.updateMany({
            where: { id: approval.toolInvocationId, status: "awaiting_approval" },
            data: { status: "expired", completedAt: now },
          })
        }
        await tx.agentRun.updateMany({
          where: { id: approval.runId, status: "awaiting_approval" },
          data: { status: "cancelled", version: { increment: 1 }, completedAt: now },
        })
        await tx.agentSession.updateMany({
          where: {
            id: approval.run.agentSessionId,
            activeRunId: approval.runId,
          },
          data: { activeRunId: null },
        })
        await tx.novaAuditEvent.create({
          data: {
            organizationId,
            agentSessionId: approval.run.agentSessionId,
            actorType: "system",
            action: "nova.approval.expire",
            resourceType: "approval_request",
            resourceId: approval.id,
            decision: "expired",
            metadata: { runId: approval.runId },
          },
        })
      }
      return { expired: true as const }
    }

    const updated = await tx.approvalRequest.updateMany({
      where: {
        id: approval.id,
        status: "pending",
        expiresAt: { gt: now },
        normalizedArgsHash: input.decision.normalizedArgsHash,
      },
      data: {
        status: input.decision.decision,
        approverMembershipId: membership.id,
        decidedAt: now,
      },
    })
    if (updated.count !== 1) {
      throw new ApprovalServiceError("Approval changed before the decision was recorded", "conflict")
    }

    await tx.novaAuditEvent.create({
      data: {
        organizationId,
        agentSessionId: approval.run.agentSessionId,
        actorType: "membership",
        actorId: membership.id,
        action: "nova.approval.decide",
        resourceType: "approval_request",
        resourceId: approval.id,
        decision: input.decision.decision,
        metadata: {
          runId: approval.runId,
          toolInvocationId: approval.toolInvocationId,
          capability: approval.capability,
          normalizedArgsHash: approval.normalizedArgsHash,
        },
      },
    })
    const continuation = await tx.novaOutboxEvent.upsert({
      where: { idempotencyKey: `approval:${approval.id}:decided` },
      create: {
        organizationId,
        agentSessionId: approval.run.agentSessionId,
        topic: "nova.approval.decided",
        idempotencyKey: `approval:${approval.id}:decided`,
        payload: { approvalId: approval.id },
      },
      update: {},
      select: { id: true },
    })

    const decided = await tx.approvalRequest.findUniqueOrThrow({
      where: { id: approval.id },
      include: { run: { include: { agentSession: true } }, toolInvocation: true },
    })
    return {
      expired: false as const,
      approval: serializeApproval(decided),
      continuationOutboxId: continuation.id,
    }
  })

  if (result.expired) {
    throw new ApprovalServiceError("Approval expired", "expired")
  }
  if (result.continuationOutboxId) {
    try {
      await publishApprovalContinuation(result.continuationOutboxId)
    } catch (error) {
      console.error("[nova/approval/publish]", error)
    }
  }
  return result.approval
}

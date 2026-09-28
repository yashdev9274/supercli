import prisma from "@super/db"
import {
  conversationalMutationToolSchema,
  parseMutationArguments,
  normalizedArgsHash,
  type ConversationalMutationTool,
  type MutationArguments,
  type MutationProposal,
} from "@super/nova"

import { inngest } from "@/inngest/client"
import { postGitHubReply } from "@/modules/nova/providers/github"
import { postLinearReply } from "@/modules/nova/providers/linear"
import { postSlackReply } from "@/modules/nova/providers/slack"

const APPROVAL_TTL_MS = 30 * 60 * 1000

const TOOL_POLICY: Record<ConversationalMutationTool, {
  provider: "slack" | "linear" | "github"
  capability: string
}> = {
  "slack.reply": { provider: "slack", capability: "slack.reply" },
  "linear.reply": { provider: "linear", capability: "linear.reply" },
  "github.comment": { provider: "github", capability: "github.comment" },
}

function argumentsForSurface(input: {
  proposal: MutationProposal
  surface: {
    id: string
    provider: string
    externalSurfaceId: string
    externalContainerId: string | null
  }
}): MutationArguments {
  const policy = TOOL_POLICY[input.proposal.tool]
  if (input.surface.provider !== policy.provider) {
    throw new Error(`Mutation tool ${input.proposal.tool} cannot target ${input.surface.provider}`)
  }

  if (input.proposal.tool === "slack.reply") {
    const separator = input.surface.externalSurfaceId.indexOf(":")
    if (separator < 1) throw new Error("Slack surface is missing its thread identity")
    return parseMutationArguments(input.proposal.tool, {
      surfaceId: input.surface.id,
      channelId: input.surface.externalSurfaceId.slice(0, separator),
      threadTimestamp: input.surface.externalSurfaceId.slice(separator + 1),
      text: input.proposal.text,
    })
  }
  if (input.proposal.tool === "linear.reply") {
    return parseMutationArguments(input.proposal.tool, {
      surfaceId: input.surface.id,
      agentSessionId: input.surface.externalSurfaceId,
      text: input.proposal.text,
    })
  }

  const match = /^(.+\/.+)#([1-9]\d*)$/.exec(input.surface.externalSurfaceId)
  if (!match) throw new Error("GitHub surface is missing its repository issue identity")
  return parseMutationArguments(input.proposal.tool, {
    surfaceId: input.surface.id,
    repository: match[1],
    issueNumber: Number(match[2]),
    text: input.proposal.text,
  })
}

export async function persistMutationProposal(input: {
  runId: string
  agentSessionId: string
  surfaceId: string
  proposal: MutationProposal
  model: string
}): Promise<{ approvalId: string; activityId: string }> {
  const policy = TOOL_POLICY[input.proposal.tool]
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS)

  return prisma.$transaction(async (tx) => {
    const run = await tx.agentRun.findFirst({
      where: {
        id: input.runId,
        agentSessionId: input.agentSessionId,
        status: "planning",
      },
      include: { agentSession: true },
    })
    if (!run) throw new Error("Nova mutation proposal requires a planning run")

    const surface = await tx.sessionSurface.findFirst({
      where: {
        id: input.surfaceId,
        agentSessionId: input.agentSessionId,
        status: "active",
      },
      select: {
        id: true,
        provider: true,
        externalSurfaceId: true,
        externalContainerId: true,
      },
    })
    if (!surface) throw new Error("Nova mutation surface is not active")

    const args = argumentsForSurface({ proposal: input.proposal, surface })
    const argsHash = normalizedArgsHash(args)
    const invocation = await tx.toolInvocation.upsert({
      where: { idempotencyKey: `run:${input.runId}:proposal` },
      create: {
        runId: input.runId,
        idempotencyKey: `run:${input.runId}:proposal`,
        toolName: input.proposal.tool,
        capability: policy.capability,
        riskClass: "write",
        normalizedArgsHash: argsHash,
        arguments: args,
        status: "awaiting_approval",
      },
      update: {},
    })
    if (
      invocation.toolName !== input.proposal.tool ||
      invocation.normalizedArgsHash !== argsHash
    ) {
      throw new Error("Nova run already contains a different mutation proposal")
    }

    const existingApproval = await tx.approvalRequest.findFirst({
      where: { runId: input.runId, toolInvocationId: invocation.id },
    })
    const approval = existingApproval ?? await tx.approvalRequest.create({
      data: {
        runId: input.runId,
        toolInvocationId: invocation.id,
        capability: policy.capability,
        normalizedArgsHash: argsHash,
        expiresAt,
      },
    })

    const existingActivity = await tx.agentActivity.findFirst({
      where: { runId: input.runId, surfaceId: input.surfaceId, type: "approval_request" },
      select: { id: true },
    })
    let activity = existingActivity
    if (!activity) {
      const session = await tx.agentSession.update({
        where: { id: input.agentSessionId },
        data: { nextSequence: { increment: 1 } },
        select: { nextSequence: true },
      })
      activity = await tx.agentActivity.create({
        data: {
          agentSessionId: input.agentSessionId,
          surfaceId: input.surfaceId,
          runId: input.runId,
          sequence: session.nextSequence - 1,
          type: "approval_request",
          status: "created",
          title: `Approval required: ${input.proposal.tool}`,
          body: input.proposal.summary,
          data: {
            approvalId: approval.id,
            toolInvocationId: invocation.id,
            tool: input.proposal.tool,
            capability: policy.capability,
            normalizedArgsHash: argsHash,
            expiresAt: approval.expiresAt.toISOString(),
            model: input.model,
          },
        },
        select: { id: true },
      })
    }

    await tx.novaAuditEvent.create({
      data: {
        organizationId: run.agentSession.organizationId,
        agentSessionId: input.agentSessionId,
        actorType: "system",
        action: "nova.mutation.propose",
        resourceType: "tool_invocation",
        resourceId: invocation.id,
        decision: "approval_required",
        metadata: {
          runId: input.runId,
          tool: input.proposal.tool,
          capability: policy.capability,
          normalizedArgsHash: argsHash,
        },
      },
    })
    const transitioned = await tx.agentRun.updateMany({
      where: { id: input.runId, status: "planning", version: run.version },
      data: { status: "awaiting_approval", version: { increment: 1 } },
    })
    if (transitioned.count !== 1) throw new Error("Nova run changed while proposing a mutation")

    return { approvalId: approval.id, activityId: activity.id }
  })
}

export async function publishApprovalContinuation(outboxEventId: string): Promise<void> {
  const outbox = await prisma.novaOutboxEvent.findUnique({ where: { id: outboxEventId } })
  if (!outbox || outbox.topic !== "nova.approval.decided") return
  const payload = outbox.payload && typeof outbox.payload === "object" && !Array.isArray(outbox.payload)
    ? outbox.payload as Record<string, unknown>
    : {}
  const approvalId = typeof payload.approvalId === "string" ? payload.approvalId : null
  if (!approvalId) throw new Error("Approval continuation is missing approvalId")

  try {
    await inngest.send({ name: "nova/approval.decided", data: { approvalId } })
    await prisma.novaOutboxEvent.updateMany({
      where: { id: outbox.id, status: { in: ["pending", "published"] } },
      data: { status: "published", attempts: { increment: 1 }, error: null },
    })
  } catch (error) {
    await prisma.novaOutboxEvent.updateMany({
      where: { id: outbox.id, status: { in: ["pending", "published"] } },
      data: {
        status: "pending",
        attempts: { increment: 1 },
        error: error instanceof Error ? error.message.slice(0, 4_000) : String(error).slice(0, 4_000),
      },
    })
    throw error
  }
}

export async function reconcileApprovalContinuations(limit = 100): Promise<{ published: number; failed: number }> {
  const events = await prisma.novaOutboxEvent.findMany({
    where: {
      topic: "nova.approval.decided",
      status: { in: ["pending", "published"] },
      availableAt: { lte: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), 500),
    select: { id: true },
  })
  let published = 0
  let failed = 0
  for (const event of events) {
    try {
      await publishApprovalContinuation(event.id)
      published += 1
    } catch {
      failed += 1
    }
  }
  return { published, failed }
}

export async function completeApprovalContinuation(approvalId: string): Promise<void> {
  await prisma.novaOutboxEvent.updateMany({
    where: {
      topic: "nova.approval.decided",
      idempotencyKey: `approval:${approvalId}:decided`,
      status: { not: "failed" },
    },
    data: { status: "completed", processedAt: new Date(), error: null },
  })
}

export async function failApprovalContinuation(approvalId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: approvalId },
    select: { runId: true, toolInvocationId: true, run: { select: { agentSessionId: true } } },
  })
  if (!approval) return
  await prisma.$transaction(async (tx) => {
    await tx.novaOutboxEvent.updateMany({
      where: {
        topic: "nova.approval.decided",
        idempotencyKey: `approval:${approvalId}:decided`,
        status: { notIn: ["completed", "failed"] },
      },
      data: { status: "failed", processedAt: new Date(), error: message.slice(0, 4_000) },
    })
    if (approval.toolInvocationId) {
      await tx.toolInvocation.updateMany({
        where: { id: approval.toolInvocationId, status: { notIn: ["completed", "denied"] } },
        data: { status: "failed", completedAt: new Date(), error: message.slice(0, 4_000) },
      })
    }
    await tx.agentRun.updateMany({
      where: { id: approval.runId, status: { notIn: ["completed", "cancelled", "failed"] } },
      data: { status: "failed", version: { increment: 1 }, completedAt: new Date() },
    })
    await tx.agentSession.updateMany({
      where: { id: approval.run.agentSessionId, activeRunId: approval.runId },
      data: { activeRunId: null },
    })
  })
}

export async function executeApprovedMutation(approvalId: string): Promise<{
  runId: string
  agentSessionId: string
  surfaceId: string
  resultId: string | null
  denied: boolean
  replayed: boolean
  runStatus: string
}> {
  const approval = await prisma.approvalRequest.findUnique({
    where: { id: approvalId },
    include: {
      toolInvocation: true,
      run: { include: { agentSession: true } },
    },
  })
  if (!approval?.toolInvocation) throw new Error("Approved Nova mutation was not found")
  const invocation = approval.toolInvocation
  const tool = conversationalMutationToolSchema.parse(invocation.toolName)
  const policy = TOOL_POLICY[tool]
  const args = parseMutationArguments(tool, invocation.arguments)
  if (normalizedArgsHash(args) !== invocation.normalizedArgsHash) {
    throw new Error("Nova mutation arguments no longer match their binding")
  }
  if (
    approval.runId !== invocation.runId ||
    approval.capability !== invocation.capability ||
    approval.capability !== policy.capability ||
    approval.normalizedArgsHash !== invocation.normalizedArgsHash
  ) {
    throw new Error("Nova approval no longer matches its tool invocation")
  }

  if (approval.status === "denied") {
    await prisma.$transaction([
      prisma.toolInvocation.updateMany({
        where: { id: invocation.id, status: "awaiting_approval" },
        data: { status: "denied", completedAt: new Date() },
      }),
      prisma.agentRun.updateMany({
        where: { id: approval.runId, status: "awaiting_approval" },
        data: { status: "cancelled", version: { increment: 1 }, completedAt: new Date() },
      }),
      prisma.agentSession.updateMany({
        where: { id: approval.run.agentSessionId, activeRunId: approval.runId },
        data: { activeRunId: null },
      }),
    ])
    return {
      runId: approval.runId,
      agentSessionId: approval.run.agentSessionId,
      surfaceId: args.surfaceId,
      resultId: null,
      denied: true,
      replayed: false,
      runStatus: "cancelled",
    }
  }
  if (approval.status !== "approved") {
    throw new Error("Nova mutation is not approved")
  }

  const surface = await prisma.sessionSurface.findFirst({
    where: {
      id: args.surfaceId,
      agentSessionId: approval.run.agentSessionId,
      provider: policy.provider,
      status: "active",
      installation: {
        organizationId: approval.run.agentSession.organizationId,
        status: { not: "revoked" },
        credentialRef: { not: null },
      },
    },
    include: { installation: true },
  })
  if (!surface?.installation?.credentialRef) {
    throw new Error("Nova mutation target is no longer authorized")
  }
  const reboundArgs = argumentsForSurface({
    proposal: { kind: "mutation_proposal", tool, text: args.text, summary: "Revalidation" },
    surface,
  })
  if (normalizedArgsHash(reboundArgs) !== approval.normalizedArgsHash) {
    throw new Error("Nova mutation target changed after approval")
  }

  const claimed = await prisma.$transaction(async (tx) => {
    const run = await tx.agentRun.updateMany({
      where: { id: approval.runId, status: "awaiting_approval" },
      data: { status: "executing", version: { increment: 1 } },
    })
    const toolClaim = await tx.toolInvocation.updateMany({
      where: { id: invocation.id, status: "awaiting_approval" },
      data: { status: "executing", startedAt: new Date(), error: null },
    })
    if (run.count !== 1 || toolClaim.count !== 1) {
      throw new Error("Nova mutation claim conflicted")
    }
    return true
  }).catch(() => false)
  if (!claimed) {
    const current = await prisma.toolInvocation.findUniqueOrThrow({ where: { id: invocation.id } })
    if (current.status === "completed") {
      const result = current.result && typeof current.result === "object" && !Array.isArray(current.result)
        ? current.result as Record<string, unknown>
        : {}
      return {
        runId: approval.runId,
        agentSessionId: approval.run.agentSessionId,
        surfaceId: args.surfaceId,
        resultId: typeof result.externalId === "string" ? result.externalId : null,
        denied: false,
        replayed: true,
        runStatus: approval.run.status,
      }
    }
    throw new Error("Nova mutation is already being processed")
  }

  let resultId: string
  try {
    if (tool === "slack.reply") {
      const slackArgs = parseMutationArguments("slack.reply", invocation.arguments)
      resultId = await postSlackReply({
        credentialRef: surface.installation.credentialRef,
        channelId: slackArgs.channelId,
        threadTimestamp: slackArgs.threadTimestamp,
        text: slackArgs.text,
      })
    } else if (tool === "linear.reply") {
      const linearArgs = parseMutationArguments("linear.reply", invocation.arguments)
      resultId = await postLinearReply({
        credentialRef: surface.installation.credentialRef,
        agentSessionId: linearArgs.agentSessionId,
        text: linearArgs.text,
      })
    } else {
      const githubArgs = parseMutationArguments("github.comment", invocation.arguments)
      resultId = await postGitHubReply({
        credentialRef: surface.installation.credentialRef,
        repository: githubArgs.repository,
        issueNumber: githubArgs.issueNumber,
        text: githubArgs.text,
      })
    }
  } catch (error) {
    await prisma.$transaction([
      prisma.toolInvocation.update({
        where: { id: invocation.id },
        data: {
          status: "failed",
          error: error instanceof Error ? error.message.slice(0, 4_000) : String(error).slice(0, 4_000),
          completedAt: new Date(),
        },
      }),
      prisma.agentRun.updateMany({
        where: { id: approval.runId, status: "executing" },
        data: { status: "failed", version: { increment: 1 }, completedAt: new Date() },
      }),
      prisma.agentSession.updateMany({
        where: { id: approval.run.agentSessionId, activeRunId: approval.runId },
        data: { activeRunId: null },
      }),
    ])
    throw error
  }

  await prisma.$transaction(async (tx) => {
    await tx.toolInvocation.update({
      where: { id: invocation.id },
      data: { status: "completed", result: { externalId: resultId }, completedAt: new Date() },
    })
    const advanced = await tx.agentRun.updateMany({
      where: { id: approval.runId, status: "executing" },
      data: { status: "verifying", version: { increment: 1 } },
    })
    if (advanced.count !== 1) throw new Error("Nova mutation finalization conflicted")
    await tx.novaAuditEvent.create({
      data: {
        organizationId: approval.run.agentSession.organizationId,
        agentSessionId: approval.run.agentSessionId,
        actorType: "system",
        action: "nova.mutation.execute",
        resourceType: "tool_invocation",
        resourceId: invocation.id,
        decision: "completed",
        metadata: { approvalId, tool, externalId: resultId },
      },
    })
  })

  return {
    runId: approval.runId,
    agentSessionId: approval.run.agentSessionId,
    surfaceId: args.surfaceId,
    resultId,
    denied: false,
    replayed: false,
    runStatus: "verifying",
  }
}

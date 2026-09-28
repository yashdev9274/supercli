import prisma from "@super/db"
import {
  agentRunStatusSchema,
  assertRunTransition,
  conversationalRunOutputSchema,
  type AgentRunStatus,
  type ConversationalRunOutput,
} from "@super/nova"
import { generateText } from "ai"

import {
  chatModel,
  gatewayProviderChain,
  providerSupportsModel,
} from "@/lib/gateway"
import { inngest } from "@/inngest/client"
import { createResponseActivity } from "@/modules/nova/delivery/service"
import {
  readGitHubPullRequestViaComposio,
} from "@/modules/nova/providers/composio"
import type { GitHubPullRequestContext } from "@/modules/nova/providers/github"
import {
  buildNovaPrompt,
  MAX_NOVA_CONTEXT_ENTRIES,
  type NovaContextEntry,
} from "@/modules/nova/runs/prompt"

const DEFAULT_NOVA_MODELS = [
  "openai/gpt-5.4-nano",
  "google/gemini-2.5-flash-lite",
  "openai/gpt-4.1-mini",
  "anthropic/claude-sonnet-4.5",
] as const

export type ClaimedNovaRun = {
  runId: string
  agentSessionId: string
  surfaceId: string
  messageId: string
  completed: boolean
  awaitingApproval: boolean
  inProgress: boolean
}

export type NovaGeneration = {
  output: ConversationalRunOutput
  model: string
}

const GITHUB_PULL_URL = /https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/([1-9]\d*)/i

function githubPullTarget(
  provider: string,
  externalSurfaceId: string,
  trigger: string,
  isPullRequest: boolean,
) {
  const urlMatch = GITHUB_PULL_URL.exec(trigger)
  if (urlMatch) {
    return { repository: `${urlMatch[1]}/${urlMatch[2]}`, pullNumber: Number(urlMatch[3]) }
  }
  if (provider !== "github" || !isPullRequest) return null
  const surfaceMatch = /^(.+\/.+)#([1-9]\d*)$/.exec(externalSurfaceId)
  return surfaceMatch
    ? { repository: surfaceMatch[1], pullNumber: Number(surfaceMatch[2]) }
    : null
}

function formatPullRequestContext(context: GitHubPullRequestContext): string {
  const files = context.changedFiles.map((file) => [
    `FILE ${file.path} (${file.status}, +${file.additions}/-${file.deletions})`,
    file.patch ?? "Patch unavailable (binary or too large).",
  ].join("\n")).join("\n\n")
  const checks = context.checks.length > 0
    ? context.checks.map((check) => `- ${check.name}: ${check.conclusion ?? check.status}`).join("\n")
    : "- No checks reported"
  return [
    `Pull request: ${context.repository}#${context.number} ${context.title}`,
    `URL: ${context.url ?? "unavailable"}`,
    `State: ${context.state}${context.draft ? " (draft)" : ""}`,
    `Branch: ${context.headBranch ?? "unknown"} @ ${context.headSha} -> ${context.baseBranch ?? "unknown"}`,
    `Author: ${context.author ?? "unknown"}`,
    `Description:\n${context.body || "No description"}`,
    `Checks:\n${checks}`,
    `Changed files:\n${files || "No changed files returned"}`,
  ].join("\n\n").slice(0, 36_000)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function resolveNovaModels(): string[] {
  const configured = process.env.NOVA_MODEL
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean) ?? []
  return [...new Set([...configured, ...DEFAULT_NOVA_MODELS])]
}

async function publishRunOutbox(outboxEventId: string): Promise<void> {
  try {
    await inngest.send({
      name: "nova/run.requested",
      data: { outboxEventId },
    })
    await prisma.novaOutboxEvent.updateMany({
      where: {
        id: outboxEventId,
        topic: "nova.run.requested",
        status: { in: ["pending", "published"] },
      },
      data: {
        status: "published",
        attempts: { increment: 1 },
        error: null,
      },
    })
  } catch (error) {
    await prisma.novaOutboxEvent.updateMany({
      where: {
        id: outboxEventId,
        topic: "nova.run.requested",
        status: { in: ["pending", "published"] },
      },
      data: {
        status: "pending",
        attempts: { increment: 1 },
        error: errorMessage(error).slice(0, 4_000),
      },
    })
    throw error
  }
}

export async function publishRunOutboxForInbound(inboundEventId: string): Promise<void> {
  const outbox = await prisma.novaOutboxEvent.findUnique({
    where: { idempotencyKey: `inbound:${inboundEventId}:run` },
    select: { id: true, status: true },
  })
  if (!outbox || !["pending", "published"].includes(outbox.status)) return
  await publishRunOutbox(outbox.id)
}

export async function reconcileRunOutbox(limit = 100): Promise<{
  published: number
  failed: number
}> {
  const events = await prisma.novaOutboxEvent.findMany({
    where: {
      topic: "nova.run.requested",
      status: "pending",
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
      await publishRunOutbox(event.id)
      published += 1
    } catch {
      failed += 1
    }
  }
  return { published, failed }
}

export async function claimRunOutbox(outboxEventId: string): Promise<ClaimedNovaRun> {
  return prisma.$transaction(async (tx) => {
    const outbox = await tx.novaOutboxEvent.findUnique({ where: { id: outboxEventId } })
    if (!outbox || outbox.topic !== "nova.run.requested" || !outbox.agentSessionId) {
      throw new Error("Nova run outbox event not found")
    }
    if (outbox.status === "failed") {
      throw new Error("Nova run outbox event is terminally failed")
    }

    const payload = outbox.payload && typeof outbox.payload === "object" && !Array.isArray(outbox.payload)
      ? outbox.payload as Record<string, unknown>
      : {}
    const inboundEventId = typeof payload.inboundEventId === "string" ? payload.inboundEventId : null
    const messageId = typeof payload.messageId === "string" ? payload.messageId : null
    if (!inboundEventId || !messageId) throw new Error("Nova run outbox payload is invalid")

    const inbound = await tx.inboundEvent.findUnique({
      where: { id: inboundEventId },
      select: {
        agentSessionId: true,
        surfaceId: true,
      },
    })
    if (
      !inbound?.surfaceId ||
      inbound.agentSessionId !== outbox.agentSessionId
    ) {
      throw new Error("Nova run has no valid conversational surface")
    }

    const message = await tx.agentSessionMessage.findFirst({
      where: {
        id: messageId,
        agentSessionId: outbox.agentSessionId,
        originEventId: inboundEventId,
      },
      select: { id: true },
    })
    if (!message) throw new Error("Nova trigger message does not match the inbound event")

    const existingRunId = typeof payload.runId === "string" ? payload.runId : null
    if (existingRunId) {
      const existingRun = await tx.agentRun.findFirst({
        where: { id: existingRunId, agentSessionId: outbox.agentSessionId },
        select: { id: true, status: true },
      })
      if (!existingRun) throw new Error("Nova run outbox references an invalid run")
      if (existingRun.status === "completed") {
        await tx.agentSession.updateMany({
          where: { id: outbox.agentSessionId, activeRunId: existingRun.id },
          data: { activeRunId: null },
        })
        await tx.novaOutboxEvent.updateMany({
          where: { id: outbox.id, status: { not: "failed" } },
          data: { status: "completed", processedAt: new Date(), error: null },
        })
      }
      const completed = existingRun.status === "completed"
      if (outbox.status === "completed" && !completed) {
        throw new Error("Nova completed outbox references a non-completed run")
      }
      return {
        runId: existingRun.id,
        agentSessionId: outbox.agentSessionId,
        surfaceId: inbound.surfaceId,
        messageId,
        completed,
        awaitingApproval: existingRun.status === "awaiting_approval",
        inProgress: existingRun.status !== "queued" && !completed,
      }
    }

    const run = await tx.agentRun.create({
      data: {
        agentSessionId: outbox.agentSessionId,
        status: "queued",
        executionTarget: "none",
        policySnapshot: {
          mode: "approval_gated_conversation",
          toolsAllowed: true,
          mutationsAllowed: true,
          allowedTools: ["slack.reply", "linear.reply", "github.comment"],
          requiresApproval: true,
        },
        startedAt: new Date(),
      },
      select: { id: true },
    })
    await tx.agentSession.update({
      where: { id: outbox.agentSessionId },
      data: { activeRunId: run.id },
    })
    await tx.novaOutboxEvent.update({
      where: { id: outbox.id },
      data: {
        status: "processing",
        attempts: { increment: 1 },
        error: null,
        payload: { ...payload, runId: run.id },
      },
    })
    return {
      runId: run.id,
      agentSessionId: outbox.agentSessionId,
      surfaceId: inbound.surfaceId,
      messageId,
      completed: false,
      awaitingApproval: false,
      inProgress: false,
    }
  })
}

export async function transitionRun(runId: string, to: AgentRunStatus): Promise<void> {
  const run = await prisma.agentRun.findUniqueOrThrow({
    where: { id: runId },
    select: { status: true, version: true },
  })
  const from = agentRunStatusSchema.parse(run.status)
  if (from === to) return
  assertRunTransition(from, to)

  const updated = await prisma.agentRun.updateMany({
    where: { id: runId, status: from, version: run.version },
    data: {
      status: to,
      version: { increment: 1 },
      completedAt: ["completed", "failed", "cancelled"].includes(to)
        ? new Date()
        : undefined,
    },
  })
  if (updated.count === 0) {
    throw new Error(`Nova run transition conflicted: ${from} -> ${to}`)
  }
}

export async function gatherRunPrompt(
  agentSessionId: string,
  messageId: string,
  surfaceId: string,
): Promise<string> {
  const trigger = await prisma.agentSessionMessage.findFirst({
    where: { id: messageId, agentSessionId },
    select: { sequence: true, content: true, originEventId: true },
  })
  if (!trigger) throw new Error("Nova trigger message does not belong to the session")

  const [session, surface, messages, activities] = await Promise.all([
    prisma.agentSession.findUniqueOrThrow({
      where: { id: agentSessionId },
      select: { objective: true, organizationId: true },
    }),
    prisma.sessionSurface.findFirstOrThrow({
      where: { id: surfaceId, agentSessionId, status: "active" },
      select: { provider: true, externalSurfaceId: true },
    }),
    prisma.agentSessionMessage.findMany({
      where: {
        agentSessionId,
        sequence: { lte: trigger.sequence },
        role: "user",
      },
      orderBy: { sequence: "desc" },
      take: MAX_NOVA_CONTEXT_ENTRIES,
      select: { sequence: true, content: true },
    }),
    prisma.agentActivity.findMany({
      where: {
        agentSessionId,
        sequence: { lte: trigger.sequence },
        type: "response",
        body: { not: null },
      },
      orderBy: { sequence: "desc" },
      take: MAX_NOVA_CONTEXT_ENTRIES,
      select: { sequence: true, body: true },
    }),
  ])

  const entries: NovaContextEntry[] = [
    ...messages.map((message) => ({
      sequence: message.sequence,
      role: "user" as const,
      content: message.content,
    })),
    ...activities.flatMap((activity) => activity.body
      ? [{ sequence: activity.sequence, role: "assistant" as const, content: activity.body }]
      : []),
  ]
  const origin = trigger.originEventId
    ? await prisma.inboundEvent.findUnique({
        where: { id: trigger.originEventId },
        select: { payload: true },
      })
    : null
  const originPayload = origin?.payload && typeof origin.payload === "object" && !Array.isArray(origin.payload)
    ? origin.payload as Record<string, unknown>
    : {}
  const target = githubPullTarget(
    surface.provider,
    surface.externalSurfaceId,
    trigger.content,
    originPayload.isPullRequest === true,
  )
  let workContext: string | null = null
  if (target) {
    try {
      workContext = formatPullRequestContext(await readGitHubPullRequestViaComposio({
        organizationId: session.organizationId,
        ...target,
      }))
    } catch {
      workContext = `Nova could not access ${target.repository}#${target.pullNumber} through this organization's GitHub Composio connection.`
    }
  }
  return buildNovaPrompt({
    objective: session.objective,
    provider: surface.provider as "desktop" | "web" | "slack" | "linear" | "github",
    triggerSequence: trigger.sequence,
    entries,
    workContext,
  })
}

function parseRunOutput(text: string): ConversationalRunOutput {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
  return conversationalRunOutputSchema.parse(JSON.parse(trimmed))
}

export async function generateNovaResponse(prompt: string): Promise<NovaGeneration> {
  const errors: string[] = []
  for (const modelId of resolveNovaModels()) {
    const providers = gatewayProviderChain(modelId).filter((provider) =>
      providerSupportsModel(provider, modelId),
    )
    for (const provider of providers) {
      try {
        const result = await generateText({
          model: chatModel(modelId, provider),
          prompt,
          maxOutputTokens: 2_048,
          maxRetries: 0,
        })
        const text = result.text.trim()
        if (!text) throw new Error("Model returned an empty response")
        return { output: parseRunOutput(text), model: `${provider}:${modelId}` }
      } catch (error) {
        errors.push(`${provider}:${modelId}: ${errorMessage(error)}`)
      }
    }
  }
  throw new Error(`All Nova models failed: ${errors.join(" | ")}`)
}

export async function persistRunResponse(
  claimed: ClaimedNovaRun,
  response: NovaGeneration,
): Promise<{ id: string }> {
  if (response.output.kind !== "response") {
    throw new Error("Mutation proposals must be persisted through the approval path")
  }
  return createResponseActivity({
    agentSessionId: claimed.agentSessionId,
    surfaceId: claimed.surfaceId,
    runId: claimed.runId,
    type: "response",
    body: response.output.text,
    data: { model: response.model, mode: "approval_gated_conversation" },
  })
}

export async function pauseRunOutbox(outboxEventId: string): Promise<void> {
  await prisma.novaOutboxEvent.updateMany({
    where: { id: outboxEventId, topic: "nova.run.requested", status: "processing" },
    data: { status: "awaiting_approval", error: null },
  })
}

export async function completeMutationRun(input: {
  runId: string
  agentSessionId: string
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const run = await tx.agentRun.findUniqueOrThrow({
      where: { id: input.runId },
      select: { status: true, version: true },
    })
    const status = agentRunStatusSchema.parse(run.status)
    if (status !== "cancelled" && status !== "completed") {
      if (status !== "delivering") throw new Error(`Cannot complete mutation run from ${status}`)
      const completed = await tx.agentRun.updateMany({
        where: { id: input.runId, status: "delivering", version: run.version },
        data: { status: "completed", version: { increment: 1 }, completedAt: new Date() },
      })
      if (completed.count !== 1) throw new Error("Nova mutation run completion conflicted")
    }
    await tx.agentSession.updateMany({
      where: { id: input.agentSessionId, activeRunId: input.runId },
      data: { activeRunId: null },
    })
    const outboxes = await tx.novaOutboxEvent.findMany({
      where: { agentSessionId: input.agentSessionId, topic: "nova.run.requested", status: "awaiting_approval" },
      select: { id: true, payload: true },
    })
    const matchingIds = outboxes.flatMap((outbox) => {
      const payload = outbox.payload && typeof outbox.payload === "object" && !Array.isArray(outbox.payload)
        ? outbox.payload as Record<string, unknown>
        : {}
      return payload.runId === input.runId ? [outbox.id] : []
    })
    if (matchingIds.length > 0) {
      await tx.novaOutboxEvent.updateMany({
        where: { id: { in: matchingIds } },
        data: { status: "completed", processedAt: new Date(), error: null },
      })
    }
  })
}

export async function completeRunOutbox(
  outboxEventId: string,
  claimed: ClaimedNovaRun,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const run = await tx.agentRun.findUniqueOrThrow({
      where: { id: claimed.runId },
      select: { status: true, version: true },
    })
    if (run.status !== "completed") {
      if (run.status !== "delivering") {
        throw new Error(`Cannot complete Nova run from ${run.status}`)
      }
      const updated = await tx.agentRun.updateMany({
        where: { id: claimed.runId, status: "delivering", version: run.version },
        data: { status: "completed", version: { increment: 1 }, completedAt: new Date() },
      })
      if (updated.count !== 1) throw new Error("Nova run completion conflicted")
    }
    await tx.agentSession.updateMany({
      where: { id: claimed.agentSessionId, activeRunId: claimed.runId },
      data: { activeRunId: null },
    })
    await tx.novaOutboxEvent.updateMany({
      where: { id: outboxEventId, status: { not: "failed" } },
      data: { status: "completed", processedAt: new Date(), error: null },
    })
  })
}

export async function markRunOutboxFailed(
  outboxEventId: string,
  error: unknown,
): Promise<void> {
  const outbox = await prisma.novaOutboxEvent.findUnique({ where: { id: outboxEventId } })
  if (!outbox || outbox.status === "completed") return
  const payload = outbox.payload && typeof outbox.payload === "object" && !Array.isArray(outbox.payload)
    ? outbox.payload as Record<string, unknown>
    : {}
  const runId = typeof payload.runId === "string" ? payload.runId : null

  await prisma.$transaction(async (tx) => {
    await tx.novaOutboxEvent.update({
      where: { id: outbox.id },
      data: {
        status: "failed",
        processedAt: new Date(),
        error: errorMessage(error).slice(0, 4_000),
      },
    })
    if (!runId) return
    await tx.agentRun.updateMany({
      where: { id: runId, status: { notIn: ["completed", "cancelled", "failed"] } },
      data: {
        status: "failed",
        version: { increment: 1 },
        completedAt: new Date(),
      },
    })
    if (outbox.agentSessionId) {
      await tx.agentSession.updateMany({
        where: { id: outbox.agentSessionId, activeRunId: runId },
        data: { activeRunId: null },
      })
    }
  })
}

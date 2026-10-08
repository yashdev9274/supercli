import prisma from "@super/db"

import { streamHarnessAgent } from "@/modules/nova/harness/agent"
import type { HarnessChatMessage } from "@/modules/nova/harness/client"
import {
  formatLocalAttachmentsContext,
  imageDataUrl,
  localAttachmentsSchema,
  type LocalAttachment,
  type LocalAttachmentMeta,
} from "@/modules/nova/attachments/contracts"
import { formatLocalProjectContext } from "@/modules/nova/local-projects/service"
import type { NovaReference, ReferenceInput } from "@/modules/nova/references/contracts"
import { resolveNovaReferences } from "@/modules/nova/references/service"
import {
  MAX_NOVA_CONTEXT_CHARS,
  MAX_NOVA_CONTEXT_ENTRIES,
} from "@/modules/nova/runs/prompt"
import { postSessionMessage } from "@/modules/nova/sessions/service"
import { resolveHarnessSelection } from "@/modules/nova-web/models"

export type TurnStreamEvent =
  | { type: "status"; phase: string; message: string; runId?: string; model?: string }
  | {
      type: "user_message"
      message: {
        id: string
        sessionId: string
        surfaceId: string | null
        sequence: number
        role: "user"
        content: string
        senderType: "member"
        senderId: string
        createdAt: string
        references?: NovaReference[]
        localAttachments?: LocalAttachmentMeta[]
      }
      runId: string
      latestSequence: number
    }
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string }
  | {
      type: "activity"
      activity: {
        id: string
        sessionId: string
        runId: string | null
        sequence: number
        type: string
        status: string
        title: string | null
        body: string | null
        createdAt: string
      }
    }
  | { type: "error"; message: string }
  | { type: "finish"; reason: string; runId?: string; latestSequence?: number; model?: string }

function effortHint(effort?: string | null): string {
  switch ((effort ?? "high").toLowerCase()) {
    case "low":
      return "Keep answers short and decisive. Prefer one recommendation."
    case "medium":
      return "Balance depth and brevity. Cover the main tradeoffs."
    case "xhigh":
    case "extra high":
      return "Go deep. Explore alternatives, edge cases, verification steps, and concrete next actions."
    default:
      return "Be thorough when the problem needs it. Surface edge cases and next steps."
  }
}

function buildSystemPrompt(objective: string, effort?: string | null, localProjectNote?: string | null) {
  return `You are Nova, Supercode's AI software engineer.

You run through the same Supercode harness as the Nova macOS app (provider routing, plan gates, usage).
On the web you reason, plan, review, draft, and coordinate company work.
- Prefer actionable guidance with file paths, commands, and concrete tradeoffs.
- Do not claim you edited local files, ran shell on a machine, or opened a desktop workspace unless the user provides that evidence.
- Local shell, filesystem, and native tools stay on the paired Nova desktop app.
- Keep prose tight and senior. No filler.
- ${effortHint(effort)}
- Session objective: ${objective}${localProjectNote ? `\n- ${localProjectNote}` : ""}`
}

async function buildTurnContext(
  sessionId: string,
  triggerSequence: number,
  fallbackUserContent: string,
  effort?: string | null,
) {
  const [session, messages, responses] = await Promise.all([
    prisma.agentSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: {
        objective: true,
        localProject: {
          select: {
            id: true,
            displayName: true,
            rootName: true,
            fileCount: true,
            truncated: true,
            repositoryFullName: true,
            status: true,
            lastUsedAt: true,
            updatedAt: true,
            pathIndex: true,
          },
        },
      },
    }),
    prisma.agentSessionMessage.findMany({
      where: {
        agentSessionId: sessionId,
        sequence: { lte: triggerSequence },
        role: { in: ["user", "assistant"] },
      },
      orderBy: { sequence: "desc" },
      take: MAX_NOVA_CONTEXT_ENTRIES,
      select: { sequence: true, content: true, role: true },
    }),
    prisma.agentActivity.findMany({
      where: {
        agentSessionId: sessionId,
        sequence: { lte: triggerSequence },
        type: "response",
        body: { not: null },
      },
      orderBy: { sequence: "desc" },
      take: MAX_NOVA_CONTEXT_ENTRIES,
      select: { sequence: true, body: true },
    }),
  ])

  const entries = [
    ...messages.map((message) => ({
      sequence: message.sequence,
      role: (message.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      content: message.content.trim(),
    })),
    ...responses.flatMap((activity) =>
      activity.body?.trim()
        ? [{ sequence: activity.sequence, role: "assistant" as const, content: activity.body.trim() }]
        : [],
    ),
  ]
    .filter((entry) => entry.content)
    .sort((a, b) => b.sequence - a.sequence)

  const window: typeof entries = []
  let remaining = MAX_NOVA_CONTEXT_CHARS
  for (const entry of entries) {
    if (window.length >= MAX_NOVA_CONTEXT_ENTRIES || remaining <= 0) break
    const bounded = entry.content.slice(Math.max(0, entry.content.length - remaining))
    window.push({ ...entry, content: bounded })
    remaining -= bounded.length
  }
  window.reverse()

  if (!window.some((entry) => entry.role === "user")) {
    window.push({
      sequence: triggerSequence,
      role: "user",
      content: fallbackUserContent.trim(),
    })
  }

  const localProject = session.localProject && session.localProject.status === "active"
    ? {
        id: session.localProject.id,
        displayName: session.localProject.displayName,
        rootName: session.localProject.rootName,
        fileCount: session.localProject.fileCount,
        truncated: session.localProject.truncated,
        repositoryFullName: session.localProject.repositoryFullName,
        status: session.localProject.status,
        lastUsedAt: session.localProject.lastUsedAt?.toISOString() ?? null,
        updatedAt: session.localProject.updatedAt.toISOString(),
        paths: Array.isArray(session.localProject.pathIndex)
          ? session.localProject.pathIndex.filter((item): item is string => typeof item === "string")
          : [],
      }
    : null

  const localProjectNote = localProject
    ? `Active local project “${localProject.displayName}” (${localProject.fileCount} indexed paths under “${localProject.rootName}”). Prefer @ Files / attachments from that project; you cannot freely read the user's disk.`
    : null

  const chatMessages: HarnessChatMessage[] = [
    { role: "system", content: buildSystemPrompt(session.objective, effort, localProjectNote) },
    ...window.map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
  ]

  return { objective: session.objective, messages: chatMessages, localProject }
}

async function completeRun(input: {
  runId: string
  sessionId: string
  surfaceId: string
  body: string
  model: string
  failed?: boolean
}) {
  return prisma.$transaction(async (tx) => {
    const seq = await tx.agentSession.update({
      where: { id: input.sessionId },
      data: { nextSequence: { increment: 1 }, updatedAt: new Date() },
      select: { nextSequence: true },
    })
    const activity = await tx.agentActivity.create({
      data: {
        agentSessionId: input.sessionId,
        surfaceId: input.surfaceId,
        runId: input.runId,
        sequence: seq.nextSequence - 1,
        type: input.failed ? "error" : "response",
        status: input.failed ? "failed" : "completed",
        title: input.failed ? "Nova hit an error" : "Nova",
        body: input.body,
        data: {
          model: input.model,
          mode: "web_engineer",
          harness: "supercode-cli/server",
        },
      },
      select: {
        id: true,
        sequence: true,
        type: true,
        status: true,
        title: true,
        body: true,
        createdAt: true,
        runId: true,
      },
    })
    await tx.agentRun.updateMany({
      where: {
        id: input.runId,
        status: { notIn: ["completed", "cancelled", "failed"] },
      },
      data: {
        status: input.failed ? "failed" : "completed",
        version: { increment: 1 },
        completedAt: new Date(),
      },
    })
    await tx.agentSession.updateMany({
      where: { id: input.sessionId, activeRunId: input.runId },
      data: { activeRunId: null },
    })
    const latest = await tx.agentSession.findUniqueOrThrow({
      where: { id: input.sessionId },
      select: { nextSequence: true },
    })
    return {
      activity: {
        id: activity.id,
        sessionId: input.sessionId,
        runId: activity.runId,
        sequence: activity.sequence,
        type: activity.type,
        status: activity.status,
        title: activity.title,
        body: activity.body,
        createdAt: activity.createdAt.toISOString(),
      },
      latestSequence: Math.max(0, latest.nextSequence - 1),
    }
  })
}

export async function* runWebTurn(input: {
  userId: string
  sessionId: string
  content: string
  clientMessageId?: string
  model?: string
  provider?: string
  effort?: string
  /** Pre-resolved harness bearer (CLI session token). */
  harnessToken: string
  signal?: AbortSignal
  references?: ReferenceInput[]
  localAttachments?: LocalAttachment[]
}): AsyncGenerator<TurnStreamEvent> {
  const content = input.content.trim()
  const selection = resolveHarnessSelection(input.model, input.provider)

  yield {
    type: "status",
    phase: "accepted",
    message: "Request accepted",
    model: selection.model,
  }

  const parsedLocal = localAttachmentsSchema.safeParse(input.localAttachments ?? [])
  if (!parsedLocal.success) {
    yield { type: "error", message: parsedLocal.error.issues[0]?.message ?? "Invalid local attachments" }
    yield { type: "finish", reason: "error" }
    return
  }
  const localAttachments = parsedLocal.data

  let resolvedReferences: Awaited<ReturnType<typeof resolveNovaReferences>>
  try {
    resolvedReferences = await resolveNovaReferences(input.userId, input.references ?? [])
  } catch (error) {
    yield { type: "error", message: error instanceof Error ? error.message : "A reference could not be resolved" }
    yield { type: "finish", reason: "error" }
    return
  }

  const posted = await postSessionMessage({
    userId: input.userId,
    sessionId: input.sessionId,
    content,
    clientMessageId: input.clientMessageId,
    surface: "web",
    references: resolvedReferences.references,
    localAttachments,
  })
  if (!posted) {
    yield { type: "error", message: "Session not found" }
    yield { type: "finish", reason: "error" }
    return
  }

  yield {
    type: "user_message",
    message: posted.message,
    runId: posted.runId,
    latestSequence: posted.latestSequence,
  }

  await prisma.agentRun.updateMany({
    where: { id: posted.runId, status: "queued" },
    data: { status: "gathering_context", version: { increment: 1 } },
  })

  try {
    const context = await buildTurnContext(
      input.sessionId,
      posted.message.sequence,
      content,
      input.effort,
    )
    const userMessage = context.messages.findLast((message) => message.role === "user")
    if (userMessage) {
      const baseText = typeof userMessage.content === "string" ? userMessage.content : ""
      let text = baseText
      if (resolvedReferences.context) {
        text += `\n\n${resolvedReferences.context}`
      }
      if (context.localProject) {
        text += `\n\n${formatLocalProjectContext(context.localProject)}`
      }
      const localContext = formatLocalAttachmentsContext(localAttachments)
      if (localContext) {
        text += `\n\n${localContext}`
      }
      const imageParts = localAttachments.flatMap((file) => {
        const url = imageDataUrl(file)
        return url ? [{ type: "image" as const, image: url }] : []
      })
      userMessage.content = imageParts.length > 0
        ? [{ type: "text", text }, ...imageParts]
        : text
    }

    yield {
      type: "status",
      phase: "executing",
      message: `Harness · ${selection.provider} · ${selection.model}`,
      runId: posted.runId,
      model: selection.model,
    }
    await prisma.agentRun.updateMany({
      where: { id: posted.runId, status: { in: ["queued", "gathering_context", "planning"] } },
      data: { status: "executing", version: { increment: 1 } },
    })

    let text = ""
    for await (const event of streamHarnessAgent({
      token: input.harnessToken,
      messages: context.messages,
      provider: selection.provider,
      model: selection.model,
      signal: input.signal,
    })) {
      if (event.type === "status") {
        yield {
          type: "status",
          phase: event.phase ?? "harness",
          message: event.message,
          runId: posted.runId,
          model: selection.model,
        }
      } else if (event.type === "text") {
        if (!event.content) continue
        text += event.content
        yield { type: "text", content: event.content }
      } else if (event.type === "reasoning") {
        if (!event.content) continue
        yield { type: "reasoning", content: event.content }
      } else if (event.type === "tool-call") {
        yield {
          type: "status",
          phase: "tool",
          message: `Connected tool · ${event.toolName}`,
          runId: posted.runId,
          model: selection.model,
        }
      } else if (event.type === "tool-result") {
        const activity = await prisma.$transaction(async (tx) => {
          const sequence = await tx.agentSession.update({
            where: { id: input.sessionId },
            data: { nextSequence: { increment: 1 } },
            select: { nextSequence: true },
          })
          return tx.agentActivity.create({
            data: {
              agentSessionId: input.sessionId,
              surfaceId: posted.surfaceId,
              runId: posted.runId,
              sequence: sequence.nextSequence - 1,
              type: "tool_result",
              status: event.status,
              title: event.toolName,
              body: event.message,
              data: { toolCallId: event.toolCallId, harness: "supercode-cli/server" },
            },
          })
        })
        yield {
          type: "activity",
          activity: {
            id: activity.id,
            sessionId: input.sessionId,
            runId: activity.runId,
            sequence: activity.sequence,
            type: activity.type,
            status: activity.status,
            title: activity.title,
            body: activity.body,
            createdAt: activity.createdAt.toISOString(),
          },
        }
      }
    }

    if (!text.trim()) {
      throw new Error("Harness returned an empty response")
    }

    await prisma.agentRun.updateMany({
      where: { id: posted.runId, status: { in: ["planning", "executing"] } },
      data: { status: "delivering", version: { increment: 1 } },
    })

    const modelTag = `${selection.provider}:${selection.model}`
    const completed = await completeRun({
      runId: posted.runId,
      sessionId: input.sessionId,
      surfaceId: posted.surfaceId,
      body: text.trim(),
      model: modelTag,
    })
    yield { type: "activity", activity: completed.activity }
    yield {
      type: "finish",
      reason: "stop",
      runId: posted.runId,
      latestSequence: completed.latestSequence,
      model: modelTag,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Harness turn failed"
    console.error("[nova/turn/harness]", message)
    try {
      const failed = await completeRun({
        runId: posted.runId,
        sessionId: input.sessionId,
        surfaceId: posted.surfaceId,
        body: message,
        model: `${selection.provider}:${selection.model}`,
        failed: true,
      })
      yield { type: "activity", activity: failed.activity }
      yield { type: "error", message }
      yield {
        type: "finish",
        reason: "error",
        runId: posted.runId,
        latestSequence: failed.latestSequence,
      }
    } catch (persistError) {
      console.error("[nova/turn/harness] persist failure", persistError)
      yield { type: "error", message }
      yield { type: "finish", reason: "error", runId: posted.runId }
    }
  }
}

import prisma from "@super/db"

import { streamHarnessAgent } from "@/modules/nova/harness/agent"
import type { HarnessChatMessage } from "@/modules/nova/harness/client"
import {
  formatLocalAttachmentsContext,
  localAttachmentsSchema,
  type LocalAttachment,
  type LocalAttachmentMeta,
} from "@/modules/nova/attachments/contracts"
import {
  parseFileProposals,
  remapProposals,
  type FileProposal,
} from "@/modules/nova/agent-files/parse-proposals"
import { packGithubProjectForTurn } from "@/modules/nova/local-projects/pack"
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
  /** Full file bodies the agent proposed — client applies these to disk / shows in the panel. */
  | { type: "file_proposals"; proposals: FileProposal[]; runId?: string }
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

function modeDirective(mode?: string | null): string {
  switch ((mode ?? "agent").toLowerCase()) {
    case "plan":
      return `Mode: PLAN
- Design the approach, tradeoffs, and file touch list.
- Do not emit full file replacements unless the user asked for sample snippets.
- End with a clear implementation sequence the Agent mode can execute next.`
    case "chat":
      return `Mode: CHAT
- Answer briefly and conversationally.
- Prefer short guidance over large patches unless the user asks for code.`
    default:
      return `Mode: AGENT (default — implement)
- You are in agentic implement mode. Do the work, do not stop at a plan.
- When the user asks to fix/build/improve UI or code and sources are in <nova_local_files>, output concrete mergeable patches now:
  - Prefer full-file replacements fenced as \`\`\`ts path=relative/path.tsx\`\`\` (or the real language).
  - Or unified diffs with --- a/path +++ b/path.
- Never end with “attach these files and I'll patch” when those files are already attached or clearly listed in the path index.
- Lead with the patches; keep narrative short. Call out what you changed in a brief summary after the patches.
- You cannot write back to disk from Nova web — still produce copy-pasteable / mergeable file bodies as if applying the change.`
  }
}

function buildSystemPrompt(
  objective: string,
  effort?: string | null,
  localProjectNote?: string | null,
  mode?: string | null,
) {
  return `You are Nova, Supercode's AI software engineer.

You run through the same Supercode harness as the Nova macOS app (provider routing, plan gates, usage).
On the web you reason, review, draft, coordinate company work, and in Agent mode implement concrete code changes.
- Prefer actionable guidance with file paths, commands, and concrete tradeoffs.
- When <nova_local_files> or <nova_local_project_paths> are present, that IS the working tree for this turn. Read it and act on it.
- Do not claim you wrote files back to disk, ran a local shell, or opened a desktop workspace unless a tool actually did.
- Keep prose tight and senior. No filler.
- ${effortHint(effort)}
- ${modeDirective(mode)}
- Session objective: ${objective}${localProjectNote ? `\n- ${localProjectNote}` : ""}`
}

async function buildTurnContext(
  sessionId: string,
  triggerSequence: number,
  fallbackUserContent: string,
  effort?: string | null,
  mode?: string | null,
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
    ? localProject.repositoryFullName
      ? `Active project “${localProject.displayName}” is GitHub repo ${localProject.repositoryFullName} (${localProject.fileCount} indexed paths). Packed sources land in <nova_local_files>. Implement against them with concrete diffs — do not ask the user to re-attach those files.`
      : `Active local project “${localProject.displayName}” (${localProject.fileCount} indexed paths under “${localProject.rootName}”). Packed sources land in <nova_local_files>. Implement against them with concrete diffs — do not ask the user to re-attach those files.`
    : null

  const chatMessages: HarnessChatMessage[] = [
    { role: "system", content: buildSystemPrompt(session.objective, effort, localProjectNote, mode) },
    ...window.map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
  ]

  return { objective: session.objective, messages: chatMessages, localProject }
}

function harnessContentToText(content: HarnessChatMessage["content"]): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) {
    // Never allow "[object Object]" into the model prompt.
    try {
      return JSON.stringify(content)
    } catch {
      return ""
    }
  }
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      if (part.type === "text" && typeof part.text === "string") return part.text
      if (part.type === "image" && typeof part.image === "string") {
        return `[image attached: ${part.image.slice(0, 64)}…]`
      }
      if (part.type === "image_url" && part.image_url?.url) {
        return `[image attached: ${part.image_url.url.slice(0, 64)}…]`
      }
      return ""
    })
    .filter(Boolean)
    .join("\n")
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
  mode?: "agent" | "plan" | "chat" | string
  /** Pre-resolved harness bearer (CLI session token). */
  harnessToken: string
  signal?: AbortSignal
  references?: ReferenceInput[]
  localAttachments?: LocalAttachment[]
}): AsyncGenerator<TurnStreamEvent> {
  const content = input.content.trim()
  const selection = resolveHarnessSelection(input.model, input.provider)
  const mode = (input.mode ?? "agent").toLowerCase()

  yield {
    type: "status",
    phase: "accepted",
    message: "Request accepted",
    model: selection.model,
  }
  yield {
    type: "status",
    phase: "mode",
    message: mode === "plan" ? "Plan mode" : mode === "chat" ? "Chat mode" : "Agent mode · implement",
    model: selection.model,
  }

  const parsedLocal = localAttachmentsSchema.safeParse(input.localAttachments ?? [])
  if (!parsedLocal.success) {
    yield { type: "error", message: parsedLocal.error.issues[0]?.message ?? "Invalid local attachments" }
    yield { type: "finish", reason: "error" }
    return
  }
  let localAttachments = parsedLocal.data

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
    yield {
      type: "status",
      phase: "gathering_context",
      message: "Gathering project context",
      runId: posted.runId,
      model: selection.model,
    }

    const context = await buildTurnContext(
      input.sessionId,
      posted.message.sequence,
      content,
      input.effort,
      mode,
    )

    // GitHub-backed projects: pull relevant file bodies server-side into this turn.
    if (context.localProject?.repositoryFullName) {
      yield {
        type: "status",
        phase: "packing",
        message: `Packing files from ${context.localProject.repositoryFullName}`,
        runId: posted.runId,
        model: selection.model,
      }
      try {
        const before = localAttachments.length
        localAttachments = await packGithubProjectForTurn(
          input.userId,
          context.localProject,
          content,
          localAttachments,
        )
        const added = localAttachments.slice(before)
        if (added.length > 0) {
          yield {
            type: "status",
            phase: "packed",
            message: `Packed ${added.length} project file${added.length === 1 ? "" : "s"}`,
            runId: posted.runId,
            model: selection.model,
          }
          for (const file of added.slice(0, 12)) {
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
                  type: "action",
                  status: "completed",
                  title: "Reading",
                  body: `read ${file.name}`,
                },
              })
            })
            yield {
              type: "activity",
              activity: {
                id: activity.id,
                sessionId: input.sessionId,
                runId: posted.runId,
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
      } catch (error) {
        console.warn("[nova/turn] github project pack failed", error)
      }
    } else if (localAttachments.length > 0) {
      yield {
        type: "status",
        phase: "packed",
        message: `Using ${localAttachments.length} attached project file${localAttachments.length === 1 ? "" : "s"}`,
        runId: posted.runId,
        model: selection.model,
      }
      for (const file of localAttachments.filter((f) => f.kind === "text").slice(0, 12)) {
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
              type: "action",
              status: "completed",
              title: "Reading",
              body: `read ${file.name}`,
            },
          })
        })
        yield {
          type: "activity",
          activity: {
            id: activity.id,
            sessionId: input.sessionId,
            runId: posted.runId,
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

    const userMessage = context.messages.findLast((message) => message.role === "user")
    if (userMessage) {
      let text = harnessContentToText(userMessage.content) || content
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
      // Always send plain string content to the harness. Multimodal arrays were
      // coercing to "[object Object]" on some terminal/provider paths.
      const imageNotes = localAttachments
        .filter((file) => file.kind === "image" && file.dataBase64)
        .map((file) => `Image attachment “${file.name}” (${file.mediaType}, ${file.size} bytes) was provided as base64 and is available to vision-capable routes.`)
      if (imageNotes.length) {
        text += `\n\n${imageNotes.join("\n")}`
      }
      if (mode === "agent") {
        text += `\n\n[Nova agent mode] Implement now. For EVERY file you change, emit a FULL file body in a fenced block with path=, e.g. \n\`\`\`tsx path=apps/web/modules/nova-web/components/workspace-panel.tsx\n...entire file...\n\`\`\`\nNova will apply those fences to the user's local folder. Do not claim you wrote a file unless you emitted its full path= fence. Do not reply with only a plan.`
      }
      userMessage.content = text
    }

    yield {
      type: "status",
      phase: "executing",
      message: `Harness · ${selection.provider} · ${selection.model}`,
      runId: posted.runId,
      model: selection.model,
    }
    // Kick a thinking step on the client even when the provider emits no reasoning tokens.
    yield {
      type: "reasoning",
      content: mode === "agent" ? "Implementing against packed project sources…" : "Working…",
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

    // Parse real file bodies (path= fences). Only then mark writes in the working log.
    let proposals = parseFileProposals(text)
    if (context.localProject?.paths?.length) {
      proposals = remapProposals(proposals, context.localProject.paths)
    }

    if (mode === "agent" && proposals.length === 0) {
      // Soft nudge only in the working log — answer still delivers.
      yield {
        type: "status",
        phase: "proposals",
        message: "No path= file fences found — agent did not emit applyable patches",
        runId: posted.runId,
        model: selection.model,
      }
    }

    for (const file of proposals) {
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
            type: "action",
            status: "completed",
            title: "Writing",
            body: `wrote ${file.path} +${file.content.split("\n").length}`,
          },
        })
      })
      yield {
        type: "activity",
        activity: {
          id: activity.id,
          sessionId: input.sessionId,
          runId: posted.runId,
          sequence: activity.sequence,
          type: activity.type,
          status: activity.status,
          title: activity.title,
          body: activity.body,
          createdAt: activity.createdAt.toISOString(),
        },
      }
    }

    if (proposals.length > 0) {
      yield {
        type: "file_proposals",
        proposals,
        runId: posted.runId,
      }
    }

    await prisma.agentRun.updateMany({
      where: { id: posted.runId, status: { in: ["planning", "executing"] } },
      data: { status: "delivering", version: { increment: 1 } },
    })

    const modelTag = `${selection.provider}:${selection.model}`
    // Append a machine-readable trailer so clients/reloads can still recover proposals.
    let body = text.trim()
    if (proposals.length > 0) {
      const trailer = [
        "",
        "<!-- nova_file_proposals",
        JSON.stringify(
          proposals.map((p) => ({
            path: p.path,
            language: p.language ?? null,
            // Keep trailer bounded for DB body size
            content: p.content.length > 200_000 ? p.content.slice(0, 200_000) : p.content,
          })),
        ).replaceAll("-->", "--\\>"),
        "-->",
      ].join("\n")
      body = `${body}${trailer}`
    }

    const completed = await completeRun({
      runId: posted.runId,
      sessionId: input.sessionId,
      surfaceId: posted.surfaceId,
      body,
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

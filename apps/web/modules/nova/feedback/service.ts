import { promises as fs } from "node:fs"
import path from "node:path"

import prisma from "@super/db"
import type {
  NovaFeedbackBatch,
  NovaFeedbackCloseout,
  NovaFeedbackEvent,
  NovaFeedbackOpen,
  NovaFeedbackUserFeedback,
} from "@super/nova"

import type { NovaFeedbackDispatchResult } from "./types"

const FILE_ROOT_ENV = "NOVA_FEEDBACK_FILE_ROOT"
const DEFAULT_FILE_ROOT = path.resolve(process.cwd(), ".nova-feedback")

const MAX_QUEUE_PER_ROW = 100_000

type InternalState = {
  id: string
  organizationId: string
  dedupeKey: string
  agentSessionId: string | null
  runId: string | null
  lastSequence: number
}

const stateCache = new Map<string, InternalState>()

function resolveFileRoot(): string {
  return process.env[FILE_ROOT_ENV] ?? DEFAULT_FILE_ROOT
}

function buildDedupeKey(input: NovaFeedbackOpen): string {
  const session = input.agentSessionId ?? "-"
  const run = input.runId ?? "-"
  return `${input.organizationId}:${session}:${run}:${input.userMessageId ?? "-"}`
}

function buildFilePath(input: NovaFeedbackOpen | { agentSessionId: string | null; runId: string | null }): string {
  const session = input.agentSessionId ?? "no-session"
  const run = input.runId ?? "no-run"
  return path.join(resolveFileRoot(), session, `${run}.md`)
}

export async function openNovaFeedback(input: NovaFeedbackOpen): Promise<NovaFeedbackDispatchResult> {
  try {
    const dedupeKey = buildDedupeKey(input)
    const filePath = buildFilePath(input)
    await ensureDir(path.dirname(filePath))
    const placeholder = `# Nova turn — ${input.title}\n\nAwaiting closeout…\n`
    await fs.writeFile(filePath, placeholder, "utf8").catch(() => undefined)
    const row = await prisma.novaFeedback.upsert({
      where: { dedupeKey },
      create: {
        organizationId: input.organizationId,
        agentSessionId: input.agentSessionId,
        runId: input.runId,
        userMessageId: input.userMessageId ?? null,
        userId: input.userId ?? null,
        title: input.title,
        summary: "",
        body: placeholder,
        filePath,
        status: "new",
        dedupeKey,
        metadata: (input.metadata ?? undefined) as never,
      },
      update: {
        metadata: (input.metadata ?? undefined) as never,
        updatedAt: new Date(),
      },
      select: { id: true, organizationId: true, agentSessionId: true, runId: true, filePath: true, status: true, issueUrl: true },
    })
    stateCache.set(dedupeKey, {
      id: row.id,
      organizationId: row.organizationId,
      dedupeKey,
      agentSessionId: row.agentSessionId,
      runId: row.runId,
      lastSequence: -1,
    })
    return { ok: true, kind: "open", feedbackId: row.id }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 200) : "feedback_open_failed",
    }
  }
}

export async function ingestNovaFeedbackBatch(input: NovaFeedbackBatch): Promise<NovaFeedbackDispatchResult> {
  try {
    const row = await prisma.novaFeedback.findUnique({
      where: { id: input.feedbackId },
      select: { id: true, organizationId: true, agentSessionId: true, runId: true, filePath: true, status: true, issueUrl: true },
    })
    if (!row) {
      return { ok: false, error: "feedback_not_found" }
    }
    const seen = new Set<number>()
    const events: { feedbackId: string; sequence: number; event: string; ts: Date; payload: unknown }[] = []
    for (const event of input.events) {
      const dedupe = event.sequence
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      events.push({
        feedbackId: row.id,
        sequence: event.sequence,
        event: event.type,
        ts: new Date(event.ts),
        payload: event.payload as Record<string, unknown>,
      })
    }
    if (events.length === 0) {
      return { ok: true, kind: "batch", feedbackId: row.id }
    }
    await prisma.$transaction([
      prisma.novaFeedbackEvent.createMany({
        data: events as never,
        skipDuplicates: true,
      }),
      prisma.novaFeedback.update({
        where: { id: row.id },
        data: { updatedAt: new Date() },
      }),
    ])
    return { ok: true, kind: "batch", feedbackId: row.id }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 200) : "feedback_batch_failed",
    }
  }
}

export async function closeoutNovaFeedback(input: NovaFeedbackCloseout): Promise<NovaFeedbackDispatchResult> {
  try {
    const row = await prisma.novaFeedback.findUnique({
      where: { id: input.feedbackId },
      select: { id: true, organizationId: true, agentSessionId: true, runId: true, filePath: true },
    })
    if (!row) {
      return { ok: false, error: "feedback_not_found" }
    }
    const eligible =
      input.severity === "error" ||
      input.severity === "warn" ||
      (Array.isArray(input.improvements) && input.improvements.length > 0)
    const status = eligible ? "pending_promotion" : "new"
    await fs.writeFile(row.filePath, input.body, "utf8").catch(() => undefined)
    await prisma.novaFeedback.update({
      where: { id: row.id },
      data: {
        body: input.body,
        summary: input.summary,
        severity: input.severity,
        status,
        metadata: input.metadata as never,
        closedAt: new Date(),
        updatedAt: new Date(),
      },
    })
    return { ok: true, kind: "closeout", feedbackId: row.id }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 200) : "feedback_closeout_failed",
    }
  }
}

export async function attachNovaFeedbackUserFeedback(input: NovaFeedbackUserFeedback): Promise<NovaFeedbackDispatchResult> {
  try {
    const existing = await prisma.novaFeedback.findUnique({
      where: { id: input.feedbackId },
      select: { id: true, status: true },
    })
    if (!existing) {
      return { ok: false, error: "feedback_not_found" }
    }
    const data: Record<string, unknown> = { updatedAt: new Date() }
    if (input.rating !== undefined) data.userRating = input.rating
    if (input.comment !== undefined) data.userComment = input.comment
    if (input.rating !== undefined && input.rating < 0 && existing.status === "new") {
      data.status = "pending_promotion"
    }
    await prisma.novaFeedback.update({ where: { id: existing.id }, data })
    return { ok: true, kind: "user_feedback", feedbackId: existing.id }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.slice(0, 200) : "feedback_user_feedback_failed",
    }
  }
}

export async function readNovaFeedbackFile(feedbackId: string): Promise<string | null> {
  const row = await prisma.novaFeedback.findUnique({
    where: { id: feedbackId },
    select: { filePath: true },
  })
  if (!row) return null
  return fs.readFile(row.filePath, "utf8").catch(() => null)
}

export async function listPromotableNovaFeedback(limit = 25) {
  return prisma.novaFeedback.findMany({
    where: { status: "pending_promotion" },
    orderBy: { createdAt: "asc" },
    take: Math.min(Math.max(limit, 1), MAX_QUEUE_PER_ROW),
    select: {
      id: true,
      organizationId: true,
      agentSessionId: true,
      runId: true,
      severity: true,
      title: true,
      summary: true,
      body: true,
      filePath: true,
      userRating: true,
      userComment: true,
      metadata: true,
      createdAt: true,
    },
  })
}

export async function markNovaFeedbackPromoted(
  feedbackId: string,
  issue: { number: number; url: string },
) {
  return prisma.novaFeedback.update({
    where: { id: feedbackId },
    data: {
      status: "promoted",
      issueNumber: issue.number,
      issueUrl: issue.url,
      promotedAt: new Date(),
      updatedAt: new Date(),
    },
  })
}

export async function resetNovaFeedbackPromotion(feedbackId: string, error: string) {
  const existing = await prisma.novaFeedback.findUnique({ where: { id: feedbackId }, select: { metadata: true } })
  const existingMetadata = (existing?.metadata ?? {}) as Record<string, unknown>
  return prisma.novaFeedback.update({
    where: { id: feedbackId },
    data: {
      status: "new",
      issueNumber: null,
      issueUrl: null,
      promotedAt: null,
      updatedAt: new Date(),
      metadata: { ...existingMetadata, lastPromotionError: error.slice(0, 600) } as never,
    },
  })
}

export async function readNovaFeedbackEvents(feedbackId: string): Promise<NovaFeedbackEvent[]> {
  const rows = await prisma.novaFeedbackEvent.findMany({
    where: { feedbackId },
    orderBy: { sequence: "asc" },
    select: { sequence: true, event: true, ts: true, payload: true },
  })
  return rows.map((row) => {
    const sequence = row.sequence
    const type = row.event as NovaFeedbackEvent["type"]
    const ts = row.ts.getTime()
    const payload = (row.payload as Record<string, unknown>) ?? {}
    return { sequence, type, ts, payload }
  })
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // ignore directory creation errors; subsequent writes will surface them
  }
}

export function __resetStateCacheForTests(): void {
  stateCache.clear()
}

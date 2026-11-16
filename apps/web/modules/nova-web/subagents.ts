import { subagentEventSchema, type SubagentEvent } from "@/modules/nova/harness/subagent-events"
import type { SessionDetail, TimelineEntry } from "./types"

export const MAX_SUBAGENTS = 64
export const MAX_SUBAGENT_MESSAGES = 100

export type WorkspaceSubagent = SubagentEvent & {
  key: string
  runId: string
  startedAt: string
  endedAt?: string
  interrupted: boolean
  messages: Array<{ id: string; timestamp: string; status: SubagentEvent["status"]; message: string }>
}

export function subagentKey(runId: string, childId: string): string {
  return `subagent:${JSON.stringify([runId, childId])}`
}

export function collectSubagents(timeline: TimelineEntry[], runs: SessionDetail["runs"] = []): WorkspaceSubagent[] {
  const children = new Map<string, WorkspaceSubagent>()
  const seen = new Set<string>()
  const activities = timeline.filter((entry) => entry.kind === "activity" && entry.type === "subagent")
    .sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id))

  for (const entry of activities) {
    if (entry.kind !== "activity" || !entry.runId || seen.has(entry.id)) continue
    seen.add(entry.id)
    let body: unknown
    try { body = JSON.parse(entry.body ?? "") } catch { continue }
    const parsed = subagentEventSchema.safeParse(body)
    if (!parsed.success) continue
    const event = parsed.data
    const key = subagentKey(entry.runId, event.childId)
    const previous = children.get(key)
    const messages = previous?.messages ?? []
    if (event.message) {
      messages.push({ id: entry.id, timestamp: event.timestamp, status: event.status, message: event.message })
    }
    const terminal = event.status !== "queued" && event.status !== "working"
    children.set(key, {
      ...event,
      key,
      runId: entry.runId,
      startedAt: previous?.startedAt ?? event.timestamp,
      endedAt: terminal ? event.timestamp : undefined,
      interrupted: false,
      messages: messages.slice(-MAX_SUBAGENT_MESSAGES),
    })
  }

  return [...children.values()].slice(-MAX_SUBAGENTS).map((child) => {
    const run = runs.find((item) => item.id === child.runId)
    if (!run || child.endedAt || !["completed", "failed", "cancelled"].includes(run.status)) return child
    return {
      ...child,
      status: run.status === "failed" ? "failed" : "cancelled",
      endedAt: Number.isFinite(Date.parse(run.updatedAt)) ? run.updatedAt : child.timestamp,
      interrupted: true,
    }
  })
}

export function subagentElapsed(child: WorkspaceSubagent, now: number): string {
  const seconds = Math.max(0, Math.floor(((child.endedAt ? Date.parse(child.endedAt) : now) - Date.parse(child.startedAt)) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

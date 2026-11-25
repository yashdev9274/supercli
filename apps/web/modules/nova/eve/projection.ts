import type { SessionStreamEvent } from "eve/client"
import { isSpecialistRole } from "@super/nova-runtime/specialists"

type ProjectedEvent = { type: "text" | "reasoning"; content: string } | { type: "status"; phase: string; message: string }

export type EveProjectionState = {
  runtimeSessionId: string | null
  nextLine: number
  nextIndex?: number
  replyParts: Record<string, string>
  partKinds?: Record<string, string>
  partialParts?: Record<string, string>
  terminalError?: string
}

export function eventCursor(runId: string, line: number, index: number): string {
  if (!Number.isSafeInteger(line) || line < 0 || line >= 999_999_999_999 || !Number.isSafeInteger(index) || index < 0 || index > 999_999) throw new Error("Invalid Eve event position")
  return `nova-eve:${runId}:event:${String(line).padStart(12, "0")}:${String(index).padStart(6, "0")}`
}

export function projectEveEvent(event: SessionStreamEvent, state: EveProjectionState, repository = false): {
  event?: ProjectedEvent
  usage?: { inputTokens: number; outputTokens: number; cacheReadTokens: number }
  terminal?: "completed" | "failed" | "cancelled"
} {
  if (event.type === "content.delta") {
    const key = `part:${event.data.partId}`
    if (key.length > 300 || event.data.delta.length > 64_000) throw new Error("Eve output exceeds canary limits")
    state.partKinds ??= {}
    state.partialParts ??= {}
    if (event.data.kind) state.partKinds[key] = event.data.kind
    const kind = state.partKinds[key] ?? "text"
    state.partialParts[key] = (state.partialParts[key] ?? "") + event.data.delta
    if (JSON.stringify(state.partialParts).length > 128_000) throw new Error("Eve output exceeds canary limits")
    if (kind === "text" || kind === "reasoning") return { event: { type: kind === "text" ? "text" : "reasoning", content: event.data.delta } }
  }
  if (event.type === "content.completed" && event.data.kind === "text" && event.data.phase === "reply" && typeof event.data.value === "string" && !event.data.interrupted) {
    const key = `part:${event.data.partId}`
    state.replyParts[key] = event.data.value
    if (JSON.stringify(state.replyParts).length > 128_000) throw new Error("Eve reply exceeds canary limits")
    if (!state.partialParts?.[key]) return { event: { type: "text", content: event.data.value } }
  }
  if (event.type === "model.started") return { event: { type: "status", phase: "executing", message: repository ? "Eve is working in an isolated repository" : "Eve is responding · read-only canary" } }
  if (event.type === "call.requested") {
    if (repository && event.data.capability.kind === "agent" && isSpecialistRole(event.data.capability.name)) return { event: { type: "status", phase: "specialist", message: `${event.data.capability.name} specialist started · read-only` } }
    const allowed = repository ? ["runtime_info", "consult_specialist", "read_file", "search_files", "read_instructions", "write_file", "edit_file", "run_command", "repository_verify", "repository_finish"] : ["runtime_info"]
    if (event.data.capability.kind !== "tool" || !allowed.includes(event.data.capability.name)) throw new Error("Unexpected capability in the read-only canary")
    return { event: { type: "status", phase: "tool", message: repository ? `Repository tool · ${event.data.capability.name}` : "Checking runtime capabilities" } }
  }
  if (event.type === "child.opened" && repository && isSpecialistRole(event.data.name)) return { event: { type: "status", phase: "specialist", message: `${event.data.name} has an independent conversation · parent reviews the result` } }
  if (event.type === "call.settled") return { event: { type: "status", phase: "tool", message: `Read-only tool ${event.data.outcome}` } }
  if (event.type === "usage.recorded") {
    const usage = event.data.usage
    for (const value of [usage.inputTokens, usage.outputTokens, usage.cacheReadTokens]) if (!Number.isFinite(value) || value < 0) throw new Error("Invalid Eve usage")
    return { usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, cacheReadTokens: usage.cacheReadTokens } }
  }
  if (event.type === "turn.paused") {
    state.terminalError = "Eve paused this run for unsupported approval or input. Start a new read-only canary turn."
    return { terminal: "failed" }
  }
  if (event.type === "session.ended") {
    state.terminalError = "The Eve session ended before producing a complete reply."
    return { terminal: "failed" }
  }
  if (event.type === "turn.settled") return { terminal: event.data.outcome === "completed" ? "completed" : event.data.outcome === "cancelled" ? "cancelled" : "failed" }
  return {}
}

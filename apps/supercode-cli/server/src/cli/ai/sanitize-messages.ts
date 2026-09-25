/**
 * Sanitize ModelMessage arrays before forwarding them to an upstream model API.
 *
 * OpenAI-compatible providers (notably ConcentrateAI) 400 when an assistant
 * message carries `tool_calls` without a matching later `role: "tool"` message.
 * Causes: aborted mid-tool turns, compaction/history flattening, stale snapshots.
 *
 * This helper:
 * - removes stale assistant tool_calls that lack matching tool results
 * - drops stray tool messages without a retained assistant call before them
 * - keeps assistant prose when stripping orphan tool_calls
 */
import type { ModelMessage } from "ai"

type AnyMsg = ModelMessage & Record<string, unknown>

function asToolCalls(msg: AnyMsg): Array<{ id?: unknown }> | null {
  const tc = msg.tool_calls
  if (!Array.isArray(tc)) return null
  return tc as Array<{ id?: unknown }>
}

function toolResultId(msg: AnyMsg): string | null {
  if (msg.role !== "tool") return null
  const id = msg.tool_call_id
  return typeof id === "string" ? id : null
}

function callIds(tcs: Array<{ id?: unknown }>): string[] {
  return tcs
    .map((tc) => (typeof tc.id === "string" ? tc.id : null))
    .filter((id): id is string => Boolean(id))
}

/**
 * Remove unpaired tool-call messages. Safe to call repeatedly.
 */
export function stripOrphanToolCalls(messages: ModelMessage[]): ModelMessage[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages

  // Backward pass: which assistant messages have all tool_call ids answered later?
  const keepAssistant = new Set<number>()
  const validToolIds = new Set<string>()
  const toolIdsAfter = new Set<string>()

  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as AnyMsg | undefined
    if (!m) continue

    const id = toolResultId(m)
    if (id) {
      toolIdsAfter.add(id)
      continue
    }

    const tcs = asToolCalls(m)
    if (!tcs) continue

    const ids = callIds(tcs)
    if (ids.length === tcs.length && ids.every((tcId) => toolIdsAfter.has(tcId))) {
      keepAssistant.add(i)
      for (const tcId of ids) validToolIds.add(tcId)
    }
  }

  // Forward pass: preserve order; only keep tool results after retained assistant calls.
  const out: ModelMessage[] = []
  const activeToolIds = new Set<string>()

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i] as AnyMsg
    const tcs = asToolCalls(m)

    if (tcs) {
      if (!keepAssistant.has(i)) {
        // Keep prose if any; drop stale tool_calls field.
        if (typeof m.content === "string" && m.content.trim()) {
          const clone = { ...m }
          delete clone.tool_calls
          out.push(clone as ModelMessage)
        }
        continue
      }
      for (const tc of tcs) {
        if (typeof tc.id === "string") activeToolIds.add(tc.id)
      }
      out.push(m as ModelMessage)
      continue
    }

    const id = toolResultId(m)
    if (id) {
      if (!validToolIds.has(id) || !activeToolIds.has(id)) continue
      activeToolIds.delete(id)
      out.push(m as ModelMessage)
      continue
    }

    out.push(m as ModelMessage)
  }

  return out
}

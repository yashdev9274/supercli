//
// Shared helpers for detecting and summarizing tool results across providers.
// Kept dependency-free so any provider (concentrate, openrouter, minimax, …)
// can use them without dragging in chat-only modules.
//

// Tools whose failure to return content is the most common "model thinks it
// has data but doesn't" trap. Used by the prepareStep sentinel.
const EMPTY_SENTINEL_GUARDED = new Set(["url_fetch", "web_search", "read_file", "search_files", "read_instructions"])

export function isEmptyToolResult(raw: string): boolean {
  if (!raw) return true
  const trimmed = raw.trim()
  if (trimmed.length === 0) return true

  let parsed: any = null
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    // Plain string. Treat short strings as empty.
    return trimmed.length < 20
  }

  if (!parsed || typeof parsed !== "object") return trimmed.length < 20

  // Permission-manager denial
  if (parsed.cancelled === true) return true
  // Structured failure envelope
  if (parsed.success === false) return true
  // Structured success envelope — check for meaningful content
  if (parsed.success === true) {
    const text = extractMeaningfulText(parsed)
    return text === null || text.length === 0
  }
  // Unknown shape — fall back to length
  return trimmed.length < 20
}

export function summarizeToolResult(raw: string): string {
  if (!raw) return "no result"
  const trimmed = raw.trim()
  if (trimmed.length === 0) return "empty result"

  let parsed: any = null
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed
  }

  if (parsed && typeof parsed === "object") {
    if (parsed.cancelled === true) return String(parsed.reason ?? "permission denied")
    if (parsed.success === false) return String(parsed.error ?? "tool error")
    if (parsed.success === true) {
      const text = extractMeaningfulText(parsed)
      if (text === null) return "ok (no content)"
      return `ok (${text.length} chars)`
    }
  }
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed
}

export function tcName(raw: unknown): string | undefined {
  if (typeof raw === "string" && raw.length > 0) return raw
  return undefined
}

// Walk a parsed tool result looking for the meaningful text payload.
// Returns null if no real content field is found (so callers can distinguish
// "empty payload" from "JSON fallback noise").
function extractMeaningfulText(parsed: any): string | null {
  if (typeof parsed === "string") return parsed.trim()
  if (!parsed || typeof parsed !== "object") return null
  const candidates = [parsed.content, parsed.summary, parsed.text, parsed.output, parsed.result, parsed.body]
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim()
  }
  if (Array.isArray(parsed.results)) {
    const joined = parsed.results
      .map((r: any) => `${r.title ?? ""} ${r.snippet ?? ""}`)
      .join(" ")
      .trim()
    if (joined.length > 0) return joined
  }
  return null
}

export function shouldGuardEmptyResult(toolName: string | undefined): boolean {
  if (!toolName) return false
  return EMPTY_SENTINEL_GUARDED.has(toolName)
}

// True when the tool result is a permission-manager denial
// (matches the shape returned by src/tools/registry.ts `withPermission`).
export function isDeniedToolResult(raw: string): boolean {
  if (!raw) return false
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    return false
  }
  return Boolean(parsed && typeof parsed === "object" && parsed.cancelled === true)
}
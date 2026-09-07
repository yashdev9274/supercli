/**
 * Shared tool-result envelopes and analysis.
 * Dependency-free so every provider (proxy, concentrate, openrouter, …) can import it.
 */

/** Tools whose empty/error results most often trigger hallucinated "facts". */
const EMPTY_SENTINEL_GUARDED = new Set([
  "url_fetch",
  "web_search",
  "firecrawl_search",
  "exa_search",
  "read_file",
  "search_files",
  "read_instructions",
])

// ── Envelopes ──────────────────────────────────────────────────────────────

export function ok<T>(data: T): string {
  return JSON.stringify({ success: true, data })
}

export function fail(error: string, hint?: string): string {
  const r: Record<string, unknown> = { success: false, error }
  if (hint) r.hint = hint
  return JSON.stringify(r)
}

/** Catch thrown errors (incl. Zod) into a structured fail() envelope. */
export async function serialize(fn: () => Promise<string>): Promise<string> {
  try {
    return await fn()
  } catch (err: unknown) {
    if (isZodError(err)) {
      return fail(
        "Invalid tool arguments. Check the tool's parameter schema and retry.",
        (err as Error).message,
      )
    }
    return fail((err as Error).message || String(err))
  }
}

export function isZodError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  return (err as any).name === "ZodError" || Array.isArray((err as any).issues)
}

/** Execute a tool def with Zod-aware error envelopes (local tool loops). */
export async function runToolExecute(
  execute: ((args: any) => Promise<string>) | undefined,
  toolName: string,
  args: unknown,
): Promise<string> {
  if (!execute) {
    return fail(`Tool "${toolName}" is not available locally`)
  }
  return serialize(() => execute(args))
}

// ── Analysis ───────────────────────────────────────────────────────────────

export function isEmptyToolResult(raw: string): boolean {
  if (!raw) return true
  const trimmed = raw.trim()
  if (trimmed.length === 0) return true

  let parsed: any = null
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return trimmed.length < 20
  }

  if (!parsed || typeof parsed !== "object") return trimmed.length < 20
  if (parsed.cancelled === true) return true

  if (parsed.success === false) {
    return !(parsed.error && String(parsed.error).length > 0)
  }

  if (parsed.success === true) {
    const text = extractMeaningfulText(parsed)
    return text === null || text.length === 0
  }

  // Validation-error shape from proxy path: { error, issues, received }
  if (typeof parsed.error === "string" && parsed.error.length > 0) return false

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
    if (typeof parsed.error === "string") return parsed.error
  }
  return trimmed.length > 80 ? `${trimmed.slice(0, 77)}…` : trimmed
}

export function tcName(raw: unknown): string | undefined {
  if (typeof raw === "string" && raw.length > 0) return raw
  return undefined
}

function extractMeaningfulText(parsed: any, depth = 0): string | null {
  if (typeof parsed === "string") return parsed.trim()
  if (!parsed || typeof parsed !== "object") return null
  if (depth > 3) return null

  const candidates = [
    parsed.content,
    parsed.summary,
    parsed.text,
    parsed.output,
    parsed.result,
    parsed.body,
    parsed.data,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim()
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const nested = extractMeaningfulText(c, depth + 1)
      if (nested !== null) return nested
    }
  }

  const arrayCandidates = [
    parsed.results,
    parsed.links,
    parsed.data?.results,
    parsed.data?.links,
  ]
  for (const arr of arrayCandidates) {
    if (Array.isArray(arr) && arr.length > 0) {
      const joined = arr
        .map((r: any) => `${r.title ?? ""} ${r.snippet ?? ""} ${r.url ?? r.link ?? ""}`)
        .join(" ")
        .trim()
      if (joined.length > 0) return joined
    }
  }
  return null
}

export function shouldGuardEmptyResult(toolName: string | undefined): boolean {
  if (!toolName) return false
  return EMPTY_SENTINEL_GUARDED.has(toolName)
}

/** Permission-manager denial (`withPermission` → cancelled: true). */
export function isDeniedToolResult(raw: string): boolean {
  if (!raw) return false
  try {
    const parsed = JSON.parse(raw)
    return Boolean(parsed && typeof parsed === "object" && parsed.cancelled === true)
  } catch {
    return false
  }
}

// ── Loop guards (shared notices for proxy + local tool loops) ──────────────

export function emptyResultsNotice(
  results: Array<{ toolName: string; result: string }>,
): string {
  const summary = results
    .map((r) => `- ${r.toolName}: ${summarizeToolResult(r.result)}`)
    .join("\n")
  return (
    "SYSTEM NOTICE: All tool calls so far have returned empty or error results. " +
    "You have NO source material to answer with. Do NOT invent specifications, pricing, " +
    "dates, leaderboard rankings, or any factual claims. Tell the user which tools failed " +
    "and what you would need to proceed.\n\nTool outcomes:\n" +
    summary
  )
}

export function denialLoopNotice(): string {
  return (
    "SYSTEM NOTICE: You have called the same permission-protected tool multiple " +
    "times after the user denied it. Stop calling it. Respond to the user with " +
    "what you have so far and ask for guidance."
  )
}

export function repetitionNotice(): string {
  return (
    "SYSTEM NOTICE: You have called the same tools with the same arguments " +
    "multiple times without making progress. Stop repeating yourself. " +
    "Analyze what you already have and respond to the user."
  )
}

export function stableArgsKey(args: unknown): string {
  if (!args || typeof args !== "object") return JSON.stringify(args ?? null)
  const obj = args as Record<string, unknown>
  return JSON.stringify(obj, Object.keys(obj).sort())
}

/** Rolling history: same tool + args ≥3 times → true. */
export class ToolCallRepetitionGuard {
  private history: Array<{ toolName: string; argsKey: string }> = []
  private readonly max = 12
  private readonly threshold = 3

  record(toolName: string, args: unknown): boolean {
    const argsKey = stableArgsKey(args)
    this.history.push({ toolName, argsKey })
    if (this.history.length > this.max) {
      this.history.splice(0, this.history.length - this.max)
    }
    let count = 0
    for (const h of this.history) {
      if (h.toolName === toolName && h.argsKey === argsKey) count++
    }
    return count >= this.threshold
  }

  get entries() {
    return this.history
  }
}

/** Consecutive denials of the same tool ≥2 → true. */
export class DenialLoopGuard {
  private counts = new Map<string, number>()
  private readonly threshold = 2

  record(toolName: string, result: string): boolean {
    if (isDeniedToolResult(result)) {
      const next = (this.counts.get(toolName) ?? 0) + 1
      this.counts.set(toolName, next)
      return next >= this.threshold
    }
    this.counts.set(toolName, 0)
    return false
  }

  get hasActiveDenial(): boolean {
    for (const c of this.counts.values()) {
      if (c >= this.threshold) return true
    }
    return false
  }
}

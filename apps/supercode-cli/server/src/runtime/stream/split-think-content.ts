/**
 * Split model output that embeds private chain-of-thought inside think-style
 * tags (DeepSeek `<think>`, MiniMax `</mm:think>`, etc.) from the user-facing
 * answer. Designed for streaming: keep a small carry buffer so tags that
 * straddle chunk boundaries are not leaked as Result text.
 */

const OPEN_TAGS = [
  "<think>",
  "<thinking>",
  "<redacted_thinking>",
  "<mm:think>",
  "<|thinking|>",
] as const

const CLOSE_TAGS = [
  "</think>",
  "</thinking>",
  "</redacted_thinking>",
  "</mm:think>",
  "<|/thinking|>",
] as const

/** Max length among open/close tags — carry at most this many trailing chars. */
const MAX_TAG_LEN = Math.max(
  ...OPEN_TAGS.map((t) => t.length),
  ...CLOSE_TAGS.map((t) => t.length),
)

function findEarliest(haystack: string, needles: readonly string[]): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null
  const lower = haystack.toLowerCase()
  for (const n of needles) {
    const i = lower.indexOf(n.toLowerCase())
    if (i < 0) continue
    if (!best || i < best.index) best = { index: i, length: n.length }
  }
  return best
}

/**
 * True when `tail` is a non-empty proper prefix of some open/close tag
 * (case-insensitive). Used to hold incomplete tags across chunks.
 */
function isPartialTagPrefix(tail: string): boolean {
  if (!tail) return false
  const t = tail.toLowerCase()
  for (const tag of [...OPEN_TAGS, ...CLOSE_TAGS]) {
    const g = tag.toLowerCase()
    if (g.startsWith(t) && t.length < g.length) return true
  }
  // Also hold a trailing "<" or "</" or "<|" which always starts a tag.
  if (/^(?:<\/?|<\||<\/[a-z0-9:_|-]*|<\|[a-z0-9:_|-]*)$/i.test(tail)) return true
  return false
}

/**
 * Longest suffix of `s` (capped to MAX_TAG_LEN-1) that could still grow into
 * an open/close tag. Prefer the rightmost '<' so prose before a partial tag
 * is not held back.
 */
function partialTagCarry(s: string): string {
  if (!s) return ""
  const window = s.slice(-Math.min(MAX_TAG_LEN - 1, s.length))
  // Scan from the end for each '<' — first match from the right wins.
  for (let i = window.length - 1; i >= 0; i--) {
    if (window[i] !== "<") continue
    const candidate = window.slice(i)
    if (isPartialTagPrefix(candidate)) return candidate
  }
  return ""
}

export type ThinkSplit = {
  /** Visible answer text for the Result rail. */
  text: string
  /** Private process text for the Thinking stream. */
  reasoning: string
}

/**
 * Incremental splitter. Create one instance per stream / turn.
 *
 * ```ts
 * const split = createThinkSplitter()
 * const a = split.push(chunk)   // { text, reasoning }
 * const b = split.flush()       // leftover after EOF
 * ```
 */
export function createThinkSplitter(startInThink = false) {
  let inThink = startInThink
  let carry = ""

  const push = (chunk: string): ThinkSplit => {
    if (!chunk && !carry) return { text: "", reasoning: "" }
    let input = carry + (chunk || "")
    carry = ""
    let text = ""
    let reasoning = ""

    while (input.length > 0) {
      if (inThink) {
        const close = findEarliest(input, CLOSE_TAGS)
        if (close) {
          reasoning += input.slice(0, close.index)
          input = input.slice(close.index + close.length)
          inThink = false
          continue
        }
        // Hold a possible partial close tag at the end.
        const tail = partialTagCarry(input)
        if (tail) {
          reasoning += input.slice(0, input.length - tail.length)
          carry = tail
          input = ""
          break
        }
        reasoning += input
        input = ""
        break
      }

      // Outside think: open tag starts a private block.
      const open = findEarliest(input, OPEN_TAGS)
      // Orphan close (DeepSeek/MiniMax often stream CoT without a matching
      // open, then end with </think> / </mm:think>). Treat everything before
      // the first close as reasoning so it never lands in Result.
      const close = findEarliest(input, CLOSE_TAGS)

      if (open && (!close || open.index < close.index)) {
        text += input.slice(0, open.index)
        input = input.slice(open.index + open.length)
        inThink = true
        continue
      }
      if (close) {
        reasoning += input.slice(0, close.index)
        input = input.slice(close.index + close.length)
        inThink = false
        continue
      }

      const tail = partialTagCarry(input)
      if (tail) {
        text += input.slice(0, input.length - tail.length)
        carry = tail
        input = ""
        break
      }
      text += input
      input = ""
      break
    }

    return { text, reasoning }
  }

  const flush = (): ThinkSplit => {
    if (!carry) return { text: "", reasoning: "" }
    const leftover = carry
    carry = ""
    if (inThink) return { text: "", reasoning: leftover }
    return { text: leftover, reasoning: "" }
  }

  return {
    push,
    flush,
    get inThink() {
      return inThink
    },
  }
}

/** One-shot split for a complete string (non-streaming). */
export function splitThinkContent(raw: string): ThinkSplit {
  const s = createThinkSplitter()
  const a = s.push(raw)
  const b = s.flush()
  return {
    text: `${a.text}${b.text}`,
    reasoning: `${a.reasoning}${b.reasoning}`,
  }
}

/**
 * Heuristic: text is private process / tool-planning monologue rather than a
 * user-facing answer. DeepSeek and similar models often emit this untagged on
 * the text channel ("Need provide query… Use web_search twice…").
 */
export function looksLikeProcessScratch(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (t.length > 6_000) return false // long dumps are more likely real answers

  const processSignals: RegExp[] = [
    /\bUser wants\b/i,
    /\bWe need\b/i,
    /\bNeed (?:to )?(?:provide|supply|call|use|run|interpret)\b/i,
    /\bI(?:'ll| will) (?:run|call|use|search|try|invoke)\b/i,
    /\bMust (?:supply|provide|call|invoke)\b/i,
    /\bUse (?:the )?(?:\w+_?\w* )?(?:tool|twice|multiple)\b/i,
    /\binvokes?\b/i,
    /\btool calls?\b/i,
    /\bin the same block\b/i,
    /\bcouldn't input\b/i,
    /\bparameters properly\b/i,
    /\bseveral web searches\b/i,
    /\bsearch web for current\b/i,
    /\bI'll run several\b/i,
    /\bdo not dump long private\b/i,
  ]
  const answerSignals: RegExp[] = [
    /^#{1,6}\s+\S/m,
    /^\s*[-*•]\s+\S.{8,}/m,
    /^\s*\d+\.\s+\S.{8,}/m,
    /\b(?:findings|results|summary|overview|conclusion)\b/i,
    /https?:\/\/\S{8,}/,
    /\|\s*[-:| ]+\|/, // markdown table
    /```[\s\S]{12,}```/,
  ]

  let processHits = 0
  for (const re of processSignals) if (re.test(t)) processHits++
  let answerHits = 0
  for (const re of answerSignals) if (re.test(t)) answerHits++

  // Strong answer structure wins.
  if (answerHits >= 2) return false
  if (answerHits >= 1 && processHits <= 1 && t.length > 280) return false

  // Multiple process cues and little/no answer structure → scratch.
  if (processHits >= 2 && answerHits === 0) return true
  if (processHits >= 3 && answerHits <= 1 && t.length < 1_200) return true

  // Short monologue that is almost only tool-planning sentences.
  const sentences = t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean)
  if (sentences.length > 0 && sentences.length <= 12) {
    const planish = sentences.filter((s) =>
      /\b(need|must|use|call|invoke|tool|search|query|parameter|block|wants)\b/i.test(s),
    ).length
    if (planish / sentences.length >= 0.6 && answerHits === 0 && t.length < 900) return true
  }

  return false
}

/**
 * Final separation after a full turn (or full non-stream body).
 * 1) Tag-based split
 * 2) If remaining "text" still looks like process scratch → move to reasoning
 * 3) Drop text that is a near-duplicate of reasoning already collected
 */
export function finalizeAnswerVsProcess(
  raw: string,
  priorReasoning = "",
): ThinkSplit {
  const tagged = splitThinkContent(raw || "")
  let text = tagged.text.trim()
  let reasoning = tagged.reasoning

  if (!text) {
    return { text: "", reasoning: reasoning.trim() }
  }

  // Near-duplicate of already-shown thinking → never put in Result.
  const prior = priorReasoning.trim()
  if (prior.length > 40) {
    const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase()
    const nt = norm(text)
    const np = norm(prior)
    if (nt === np || np.includes(nt) || (nt.length > 60 && nt.includes(np.slice(0, Math.min(120, np.length))))) {
      reasoning = `${reasoning}\n${text}`.trim()
      return { text: "", reasoning }
    }
    // High overlap ratio
    const sample = nt.slice(0, Math.min(160, nt.length))
    if (sample.length > 50 && np.includes(sample)) {
      reasoning = `${reasoning}\n${text}`.trim()
      return { text: "", reasoning }
    }
  }

  if (looksLikeProcessScratch(text)) {
    reasoning = `${reasoning}\n${text}`.trim()
    return { text: "", reasoning }
  }

  return { text, reasoning: reasoning.trim() }
}

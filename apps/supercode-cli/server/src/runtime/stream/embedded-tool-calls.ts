// MiniMax (via the Supercode cloud / concentrate.ai relay) is
// nondeterministic about tool-call transport. Most of the time it emits a
// proper OpenAI-style `delta.tool_calls` array. But it *occasionally* emits
// the tool call as inline TEXT inside `delta.content`, in one of several shapes:
//
//   [TOOL_CALL]
//   run_command --command="git diff --staged"
//   [/TOOL_CALL]
//
//   <tool_call><invoke name="run_command">
//   <parameter name="command">git diff --staged</parameter>
//   </invoke></tool_call>
//
//   <tool_call><invoke name="run_command">
//   <command>git diff --staged</command>
//   <description>Show the staged diff</description>
//   </invoke></tool_call>
//
//   <invoke name="run_command"><command>git status</command></invoke>
//
//   {"name":"run_command","parameters":{"command":"git diff --staged"}}
//
//   { "tool": "run_command", "command": "git status", "description": "..." }
//
// Plus junk control tokens like:
//   ]<]minimax[>[<tool_call>
//   <|tool_call_begin|> / <|minimax|> / etc.
//
// DeepSeek (via concentrate) also leaks DSML control tokens into content:
//   <｜｜DSML｜｜tool_calls>
//   <｜｜DSML｜｜function_calls>
//   <｜｜DSML｜｜invoke name="read_file">...</｜｜DSML｜｜invoke>
//   <｜｜DSML｜｜>
//
// If those markers survive to the client they render as raw garbage in the
// chat instead of executing. This module strips the markers out of the stream
// and converts them into structured tool-call objects the relay can re-emit
// as real `tool-call` events.

export interface EmbeddedToolCall {
  name: string
  args: Record<string, unknown>
  id: string
}

export interface ParsedBlock {
  // Text that should be streamed onward verbatim (may be empty).
  text: string
  // Parsed tool calls (already complete).
  calls: EmbeddedToolCall[]
  // Left-over buffer that must be kept for the next chunk (an opener that
  // hasn't been closed yet). Empty when nothing is pending.
  pending: string
}

const SQUARE_CLOSE = /\[\/TOOL_CALL\]|\[\/tool_call\]/g
const XML_CLOSE = /<\/tool_call>/g
const INVOKE_CLOSE = /<\/invoke>/g
const LOOSE_INVOKE_CLOSE = /<\/invoke>|\/invoke>/g
// DeepSeek DSML close: </｜DSML｜invoke>, </｜｜DSML｜｜invoke>, </||DSML||invoke>
const DSML_INVOKE_CLOSE =
  /<\/｜{1,2}\s*DSML\s*｜{1,2}\s*(?:invoke|tool)\s*>|<\/\|\|\s*DSML\s*\|\|\s*(?:invoke|tool)\s*>/gi

// Known supercode tool names. The bare-JSON descriptor shape is only accepted
// when `name`/`tool` matches one of these, so prose that happens to contain a JSON
// object (e.g. tool results) is never misparsed into a phantom tool call.
export const KNOWN_TOOL_NAMES = new Set([
  "read_file",
  "search_files",
  "write_file",
  "edit_file",
  "run_command",
  "url_fetch",
  "web_search",
  "firecrawl_search",
  "firecrawl_scrape",
  "firecrawl_map",
  "exa_search",
  "exa_fetch",
  "code_exec",
  "read_instructions",
  "switch_to_agent_mode",
  "delegate",
  "task",
  "question",
  "todowrite",
  "skill",
  "crisp_review",
  "crisp_audit",
  "crisp_debt",
  "crisp_gain",
])

// MiniMax / concentrate control tokens that leak into content. Strip them so
// they never render in the TUI. Keep this permissive — unknown vendor tokens
// of the same shape are harmless to drop.
const CONTROL_TOKEN_RE =
  /\]\s*<\s*\]\s*minimax\s*\[\s*>\s*(?:\[\s*<\s*tool_call\s*>)?|<\[\s*<\s*tool_call\s*>|<\|\s*[^|>]+\s*\|>|\]\s*<\s*\]\s*[a-z0-9_-]+\s*\[\s*>/gi

// DeepSeek DSML special tokens use fullwidth vertical bars: <｜DSML｜…>
// Also accept doubled bars and ASCII `|` variants from some relays.
// IMPORTANT: do NOT match invoke/parameter/tool tags here — those are
// recovered as real tool calls by the streaming parser. Only structural
// wrappers and bare special tokens are stripped as control junk.
const DSML_STRUCTURAL_RE =
  /<\/?｜{1,2}\s*DSML\s*｜{1,2}\s*(?:tool_calls|function_calls)?\s*>|<\/?\|\|\s*DSML\s*\|\|\s*(?:tool_calls|function_calls)?\s*>/gi

// Any remaining DSML special token that is NOT an invoke/parameter/tool body
// tag (those are handled by the dsml-invoke path). Used as a last-pass strip.
const DSML_TOKEN_RE =
  /<\/?｜{1,2}\s*DSML\s*｜{1,2}[^>]*>|<｜{1,2}[^>｜]*｜{1,2}>|<\/?\|\|\s*DSML\s*\|\|[^>]*>|<\|\|[^|>]*\|\|>/gi

/** True when a DSML tag is an invoke / parameter / tool body opener or closer. */
function isDsmlToolBodyTag(tag: string): boolean {
  return /(?:invoke|parameter|tool)\b/i.test(tag)
}

/**
 * Strip MiniMax / vendor control tokens from a text chunk.
 * Safe to call on any streamed prose. Does not remove DSML invoke bodies
 * that still need parsing — callers should parse first, then strip leftovers.
 */
export function stripControlTokens(text: string): string {
  if (!text) return ""
  // First drop structural wrappers, then any leftover special tokens that
  // are not part of a still-parseable invoke body (those should already
  // have been consumed by the streaming pump).
  let out = text
    .replace(CONTROL_TOKEN_RE, "")
    .replace(DSML_STRUCTURAL_RE, "")
    .replace(/\[<\s*tool_call\s*>/gi, "")
    .replace(/\/(?:tool_call|invoke)\s*>/gi, "")

  // Strip remaining DSML tags, but keep invoke/parameter bodies intact so a
  // one-shot extract still has something to parse if pump missed them.
  out = out.replace(DSML_TOKEN_RE, (tag) => (isDsmlToolBodyTag(tag) ? tag : ""))

  // Leftover bare DSML openers after partial stream cuts (no complete tag).
  out = out
    .replace(/<｜{1,2}\s*DSML\s*｜{0,2}(?![\s\S]*[>])/gi, "")
    .replace(/\|\|\s*DSML\s*\|\|(?![\s\S]*[>])/gi, "")

  // Only strip dangling fullwidth bar openers that are clearly incomplete
  // control tokens (not part of a kept invoke tag).
  if (!/<｜{1,2}\s*DSML\s*｜{1,2}\s*(?:invoke|parameter|tool)\b/i.test(out)) {
    out = out.replace(/<｜{1,2}(?![\s\S]*｜)/g, "").replace(/｜{1,2}>/g, "")
  }
  return out
}

/**
 * One-shot parse of a complete (non-streaming) string that may contain
 * embedded tool calls. Used by the client proxy as a safety net when the
 * server still streams raw MiniMax markup as text.
 */
export function extractEmbeddedToolCalls(
  content: string,
  opts?: { knownTools?: Set<string> },
): { text: string; calls: EmbeddedToolCall[] } {
  const parser = parseStreamedContent(opts)
  const out = parser.push(content)
  const flushed = parser.flush()
  return {
    text: `${out.text}${flushed.text}`,
    calls: [...out.calls, ...flushed.calls],
  }
}

/**
 * Streaming parser for minimax inline tool-call text.
 *
 * Feed it `delta.content` chunks one at a time via `push()`. It emits a
 * stable prefix of the buffer that is no longer part of an in-flight marker,
 * plus any completed tool calls, and keeps the rest in `pending` for the next
 * chunk. Call `flush()` once the upstream stream ends to release whatever is
 * left (normally just trailing prose).
 *
 * While inside an open marker the surrounding prose is held back — minimax
 * emits narration *before* the marker, so withholding a few tokens until the
 * block closes is invisible in practice.
 */
export function parseStreamedContent(opts?: { knownTools?: Set<string> }): {
  push(chunk: string): ParsedBlock
  flush(): ParsedBlock
} {
  const knownTools = opts?.knownTools ?? KNOWN_TOOL_NAMES
  let buf = ""

  function pump(block: string): ParsedBlock {
    const text: string[] = []
    const calls: EmbeddedToolCall[] = []
    let pending = ""
    let i = 0

while (i < block.length) {
      // Find the next opener (square, xml, bare invoke, DSML invoke, bare JSON, or control).
      let nextOpen = -1
      let openKind:
        | "square"
        | "xml"
        | "invoke"
        | "loose-invoke"
        | "dsml-invoke"
        | "json"
        | "control" = "square"
      const squareAt = block.indexOf("[TOOL_CALL]", i)
      const squareAtLow = block.indexOf("[tool_call]", i)
      const xmlAt = block.indexOf("<tool_call>", i)
      const xmlAtAlt = block.indexOf("<tool_call", i)
      const invokeAt = block.indexOf("<invoke", i)
      const looseInvokeAt = findLooseInvokeStart(block, i)
      const dsmlInvokeAt = findDsmlInvokeStart(block, i)
      const jsonAt = findJsonDescriptorStart(block, i)
      const controlAt = findControlTokenStart(block, i)

      let sq = squareAt
      if (squareAtLow !== -1 && (sq === -1 || squareAtLow < sq)) sq = squareAtLow
      if (sq !== -1) {
        nextOpen = sq
        openKind = "square"
      }
      if (xmlAt !== -1 && (nextOpen === -1 || xmlAt < nextOpen)) {
        nextOpen = xmlAt
        openKind = "xml"
      } else if (
        xmlAtAlt !== -1 &&
        (nextOpen === -1 || xmlAtAlt < nextOpen) &&
        /^<tool_call[\s>]/i.test(block.slice(xmlAtAlt))
      ) {
        nextOpen = xmlAtAlt
        openKind = "xml"
      }
      if (
        invokeAt !== -1 &&
        (nextOpen === -1 || invokeAt < nextOpen) &&
        /^<invoke[\s>]/i.test(block.slice(invokeAt))
      ) {
        nextOpen = invokeAt
        openKind = "invoke"
      }
      if (looseInvokeAt !== -1 && (nextOpen === -1 || looseInvokeAt < nextOpen)) {
        nextOpen = looseInvokeAt
        openKind = "loose-invoke"
      }
      if (dsmlInvokeAt !== -1 && (nextOpen === -1 || dsmlInvokeAt < nextOpen)) {
        nextOpen = dsmlInvokeAt
        openKind = "dsml-invoke"
      }
      if (jsonAt !== -1 && (nextOpen === -1 || jsonAt < nextOpen)) {
        nextOpen = jsonAt
        openKind = "json"
      }
      if (controlAt !== -1 && (nextOpen === -1 || controlAt < nextOpen)) {
        nextOpen = controlAt
        openKind = "control"
      }

      if (nextOpen === -1) {
        // Hold back a short tail that might be the start of a multi-chunk
        // opener (`[TOOL`, `<tool`, `{"name"`, `]<]min`, etc.).
        const tailHold = holdPartialOpener(block.slice(i))
        if (tailHold.hold) {
          text.push(tailHold.emit)
          pending = tailHold.hold
        } else {
          text.push(block.slice(i))
        }
        break
      }

// Emit everything before the opener. Skip pure-whitespace separators
      // that only exist between control tokens / tool descriptors.
      const before = block.slice(i, nextOpen)
      if (before.length > 0) {
        if (
          /^\s*$/.test(before) &&
          (openKind === "json" ||
            openKind === "xml" ||
            openKind === "invoke" ||
            openKind === "loose-invoke" ||
            openKind === "dsml-invoke" ||
            openKind === "control")
        ) {
          // drop
        } else {
          text.push(before)
        }
      }

if (openKind === "control") {
        const consumed = consumeControlToken(block.slice(nextOpen))
        if (consumed === -1) {
          // Incomplete control token — hold for next chunk.
          pending = block.slice(nextOpen)
          i = block.length
          break
        }
        if (consumed === 0) {
          // Control path hit a DSML invoke/parameter body it must not strip.
          // Prefer the dedicated invoke parser when possible; otherwise skip one
          // char so we never spin forever on a zero-width consume.
          const dsmlAt = findDsmlInvokeStart(block, nextOpen)
          if (dsmlAt === nextOpen) {
            openKind = "dsml-invoke"
            // fall through to the block parser below (do not continue)
          } else {
            i = nextOpen + 1
            continue
          }
        } else {
          i = nextOpen + consumed
          continue
        }
      }

      if (openKind === "json") {
        const parsed = tryParseJsonDescriptor(block.slice(nextOpen), knownTools)
        if (parsed?.complete) {
          calls.push(parsed.call)
          i = nextOpen + parsed.length
          continue
        }
        if (parsed?.incomplete) {
          // Descriptor start but not yet closed — hold the tail for next chunk.
          pending = block.slice(nextOpen)
          i = block.length
          break
        }
        // Starts with `{"name"` / `{"tool"` but isn't a valid known-tool descriptor:
        // emit the `{` and keep scanning (avoids a hang on `{"name":"Foo"}`).
        text.push(block[nextOpen] ?? "{")
        i = nextOpen + 1
        continue
      }

const tail = block.slice(nextOpen)
      // tail begins with the opener tag; find the matching close, but the
      // inner content excludes the opener itself.
      const opLen =
        openKind === "square"
          ? /^\[tool_call\]/i.test(tail)
            ? "[tool_call]".length
            : "[TOOL_CALL]".length
          : openKind === "dsml-invoke"
            ? (() => {
                const m =
                  /^<｜{1,2}\s*DSML\s*｜{1,2}\s*(?:invoke|tool)\b[^>]*>/i.exec(tail) ||
                  /^<\|\|\s*DSML\s*\|\|\s*(?:invoke|tool)\b[^>]*>/i.exec(tail)
                return m ? m[0].length : 0
              })()
          : openKind === "invoke" || openKind === "loose-invoke"
            ? (() => {
                const m = openKind === "invoke"
                  ? /^<invoke\b[^>]*>/i.exec(tail)
                  : /^invoke\b[^>]*>/i.exec(tail)
                return m ? m[0].length : openKind === "invoke" ? "<invoke>".length : "invoke>".length
              })()
            : /^<tool_call>/i.test(tail)
              ? "<tool_call>".length
              : (() => {
                  const m = /^<tool_call[^>]*>/i.exec(tail)
                  return m ? m[0].length : "<tool_call>".length
                })()
      const innerStart = opLen
      const closeRe =
        openKind === "square"
          ? SQUARE_CLOSE
          : openKind === "dsml-invoke"
            ? DSML_INVOKE_CLOSE
            : openKind === "invoke"
              ? INVOKE_CLOSE
              : openKind === "loose-invoke"
                ? LOOSE_INVOKE_CLOSE
                : XML_CLOSE
      closeRe.lastIndex = 0
      const closeMatch = closeRe.exec(tail)
      if (!closeMatch) {
        // Opener not yet closed — hold the whole tail for the next chunk.
        pending = tail
        i = block.length
        break
      }

      // Bare <invoke> / DSML invoke blocks pass the FULL block (open tag included)
      // to the parser, which scans for name= itself.
      const inner = tail.slice(innerStart, closeMatch.index)
      const fullBlock = tail.slice(0, closeMatch.index + closeMatch[0].length)
      calls.push(
        ...(openKind === "invoke"
          ? parseBlock(fullBlock, "invoke")
          : openKind === "loose-invoke"
            ? parseLooseInvokeBlock(fullBlock, knownTools)
            : openKind === "dsml-invoke"
              ? parseDsmlInvokeBlock(fullBlock)
              : parseBlock(inner, openKind)),
      )
      i = nextOpen + closeMatch.index + closeMatch[0].length
    }

    // When we extracted tool calls, drop whitespace-only leftovers that were
      // just separators between descriptors (newlines around JSON blobs).
      let joined = stripControlTokens(text.join(""))
      if (calls.length > 0) {
        // Keep interior whitespace (between prose sentences) but drop pure
        // leading/trailing separator whitespace introduced by markers.
        joined = joined.replace(/^\n+/, "").replace(/\n+$/, "").replace(/^ +/, "").replace(/ +$/, "")
      }
      return { text: joined, calls, pending }
  }

  return {
    push(chunk: string): ParsedBlock {
      buf += chunk
      const out = pump(buf)
      buf = out.pending
      if (out.calls.length > 0 && !out.pending) {
        return { ...out, text: out.text.replace(/\n+$/, "").replace(/ +$/, "") }
      }
      return out
    },
    flush(): ParsedBlock {
      const remaining = buf
      buf = ""
      if (!remaining) return { text: "", calls: [], pending: "" }

      // Final pass: try to extract any complete markers still in the buffer.
      // Truncated openers are dropped rather than leaked as raw markup.
      const out = pump(remaining)
      if (!out.pending) {
        if (out.calls.length > 0) {
          return {
            ...out,
            text: out.text.replace(/^\n+/, "").replace(/\n+$/, "").replace(/^ +/, "").replace(/ +$/, ""),
          }
        }
        return out
      }

      // Still holding something — drop unclosed markers, keep only clean prose
      // that doesn't look like a partial tool-call opener.
const cleaned = stripControlTokens(out.pending)
      if (
        /\[tool_call/i.test(cleaned) ||
        /<tool_call/i.test(cleaned) ||
        /<invoke\b/i.test(cleaned) ||
        /\binvoke\s+name\s*=/i.test(cleaned) ||
        /｜\s*DSML\s*｜\s*(?:invoke|tool|parameter)\b/i.test(cleaned) ||
        /\|\|\s*DSML\s*\|\|\s*(?:invoke|tool|parameter)\b/i.test(cleaned) ||
        /^\s*\{\s*"(?:name|tool)"\s*:/.test(cleaned) ||
        /\]\s*<\s*\]/.test(cleaned) ||
        /<\|\s*[^|>]*$/.test(cleaned) ||
        /<｜/.test(cleaned)
      ) {
        const text = out.calls.length > 0
          ? out.text.replace(/\n+$/, "").replace(/ +$/, "")
          : out.text
        return { text, calls: out.calls, pending: "" }
      }
      const text = out.text + cleaned
      return {
        text: out.calls.length > 0
          ? text.replace(/^\n+/, "").replace(/\n+$/, "").replace(/^ +/, "").replace(/ +$/, "")
          : text,
        calls: out.calls,
        pending: "",
      }
    },
  }
}

function parseBlock(inner: string, kind: "square" | "xml" | "invoke"): EmbeddedToolCall[] {
  try {
    if (kind === "xml" || kind === "invoke") {
      const call = parseXmlBlock(inner)
      return call ? [call] : []
    }
    return parseSquareBlock(inner)
  } catch {
    return []
  }
}

/** XML shapes:
 *   <invoke name="X"><parameter name="Y">value</parameter></invoke>
 *   <invoke name="X"><command>...</command><description>...</description></invoke>
 */
function parseXmlBlock(inner: string): EmbeddedToolCall | null {
  // name attribute — quoted or unquoted.
  const nameMatch = /<invoke\s+name\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/.exec(inner)
  if (!nameMatch) return null
  const name = (nameMatch[1] ?? nameMatch[2] ?? nameMatch[3]) ?? ""
  const args: Record<string, unknown> = {}
  // parameter name — quoted or unquoted.
  const paramRe =
    /<parameter\s+name\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))\s*[^>]*>([\s\S]*?)<\/parameter>/g
  let m: RegExpExecArray | null
  while ((m = paramRe.exec(inner))) {
    const pname = m[1] ?? m[2] ?? m[3] ?? ""
    const value = m[4] ?? ""
    if (pname) args[pname] = decodeEntities(value.trim())
  }
  // <command>…</command> → args.command (MiniMax `<invoke>` variant)
  const commandMatch = /<command\b[^>]*>([\s\S]*?)<\/command>/i.exec(inner)
  if (commandMatch && commandMatch[1]?.trim()) {
    args.command = decodeEntities(commandMatch[1].trim())
  }
  // <description>…</description> → args.description
  const descMatch = /<description\b[^>]*>([\s\S]*?)<\/description>/i.exec(inner)
  if (descMatch && descMatch[1]?.trim()) {
    args.description = decodeEntities(descMatch[1].trim())
  }
  if (Object.keys(args).length === 0) return null
  return { name, args, id: "" }
}

/**
 * DeepSeek DSML invoke shapes (V3.2 function_calls / V4 tool_calls):
 *   <｜DSML｜invoke name="read_file">
 *   <｜DSML｜parameter name="path" string="true">/x.md</｜DSML｜parameter>
 *   </｜DSML｜invoke>
 *
 * Also accepts doubled bars and ASCII || variants from relays, plus the
 * alternate `<｜DSML｜tool name="…">` form some checkpoints emit.
 */
function parseDsmlInvokeBlock(block: string): EmbeddedToolCall[] {
  try {
    const nameMatch =
      /<｜{1,2}\s*DSML\s*｜{1,2}\s*(?:invoke|tool)\s+name\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(
        block,
      ) ||
      /<\|\|\s*DSML\s*\|\|\s*(?:invoke|tool)\s+name\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(
        block,
      )
    if (!nameMatch) return []
    const name = (nameMatch[1] ?? nameMatch[2] ?? nameMatch[3] ?? "").trim()
    if (!name) return []

    const args: Record<string, unknown> = {}
    const paramRe =
      /<｜{1,2}\s*DSML\s*｜{1,2}\s*parameter\s+name\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))\s*(?:string\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?\s*[^>]*>([\s\S]*?)<\/｜{1,2}\s*DSML\s*｜{1,2}\s*parameter\s*>|<\|\|\s*DSML\s*\|\|\s*parameter\s+name\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))\s*(?:string\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?\s*[^>]*>([\s\S]*?)<\/\|\|\s*DSML\s*\|\|\s*parameter\s*>/gi
    let m: RegExpExecArray | null
    while ((m = paramRe.exec(block))) {
      const pname = (m[1] ?? m[2] ?? m[3] ?? m[8] ?? m[9] ?? m[10] ?? "").trim()
      const stringAttr = (m[4] ?? m[5] ?? m[6] ?? m[11] ?? m[12] ?? m[13] ?? "true").toLowerCase()
      const raw = (m[7] ?? m[14] ?? "").trim()
      if (!pname) continue
      if (stringAttr === "false") {
        try {
          args[pname] = JSON.parse(raw)
        } catch {
          args[pname] = decodeEntities(raw)
        }
      } else {
        args[pname] = decodeEntities(raw)
      }
    }

    // Fallback: bare JSON object inside the invoke body (some relays).
    if (Object.keys(args).length === 0) {
      const jsonBody = /\{[\s\S]*\}/.exec(block)
      if (jsonBody) {
        try {
          const parsed = JSON.parse(jsonBody[0])
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            Object.assign(args, parsed as Record<string, unknown>)
          }
        } catch {
          /* ignore */
        }
      }
    }

    // Zero-arg tools are valid; name-only invokes still execute.
    return [{ name, args, id: "" }]
  } catch {
    return []
  }
}

function findDsmlInvokeStart(s: string, from: number): number {
  const re =
    /<｜{1,2}\s*DSML\s*｜{1,2}\s*(?:invoke|tool)\b|<\|\|\s*DSML\s*\|\|\s*(?:invoke|tool)\b/gi
  re.lastIndex = from
  const m = re.exec(s)
  return m ? m.index : -1
}

/**
 * Degraded MiniMax paste/render shape where the leading `<` characters have
 * already been stripped before the safety parser sees the text:
 *   invoke name="run_command">command>git status/command>/invoke>
 */
function parseLooseInvokeBlock(inner: string, knownTools: Set<string>): EmbeddedToolCall[] {
  const nameMatch = /\binvoke\s+name\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i.exec(inner)
  if (!nameMatch) return []
  const name = (nameMatch[1] ?? nameMatch[2] ?? nameMatch[3]) ?? ""
  if (!knownTools.has(name)) return []

  const args: Record<string, unknown> = {}
  const paramRe =
    /(?:^|[<>\s])parameter\s+name\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))\s*[^>]*>([\s\S]*?)(?:<\/parameter>|\/parameter>)/gi
  let m: RegExpExecArray | null
  while ((m = paramRe.exec(inner))) {
    const pname = m[1] ?? m[2] ?? m[3] ?? ""
    const value = m[4] ?? ""
    if (pname) args[pname] = decodeEntities(value.trim())
  }

  const commandMatch = /(?:^|[<>\s])command\b[^>]*>([\s\S]*?)(?:<\/command>|\/command>)/i.exec(inner)
  if (commandMatch && commandMatch[1]?.trim()) {
    args.command = decodeEntities(commandMatch[1].trim())
  }
  const descMatch = /(?:^|[<>\s])description\b[^>]*>([\s\S]*?)(?:<\/description>|\/description>)/i.exec(inner)
  if (descMatch && descMatch[1]?.trim()) {
    args.description = decodeEntities(descMatch[1].trim())
  }

  if (Object.keys(args).length === 0) return []
  return [{ name, args, id: "" }]
}

/** Square shape: `run_command --command="git diff --staged"` */
function parseSquareBlock(inner: string): EmbeddedToolCall[] {
  const nameMatch = /^\s*([A-Za-z_][A-Za-z0-9_]*)/.exec(inner)
  if (!nameMatch) return []
  const name = nameMatch[1] ?? ""
  const args: Record<string, unknown> = {}
  const flagRe = /--([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/g
  let m: RegExpExecArray | null
  while ((m = flagRe.exec(inner))) {
    const key = m[1] ?? ""
    if (key) args[key] = m[2] ?? m[3] ?? m[4] ?? true
  }
  if (Object.keys(args).length === 0) return []
  return [{ name, args, id: "" }]
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
}

//
// ─── Bare-JSON descriptor shape ────────────────────────────────────────────
//
//   {"name":"run_command","parameters":{"command":"git diff --staged"}}
//   { "tool": "run_command", "command": "git status", "description": "..." }
//
// Minimax occasionally dumps a complete JSON tool-call *descriptor* as inline
// content text rather than a structured `delta.tool_calls` array. It is only
// treated as a tool call when `name`/`tool` maps to a known tool; otherwise it
// is left as prose. Descriptors may nest args under `parameters`/`arguments`/
// `args`, or put them as top-level sibling keys next to `tool`/`name`.
//

// Locate the next plausible descriptor start: a `{` followed by `"name"` or
// `"tool"` (allowing optional whitespace). Returns the index or -1.
function findJsonDescriptorStart(s: string, from: number): number {
  const re = /\{\s*"(?:name|tool)"\s*:/g
  re.lastIndex = from
  const m = re.exec(s)
  return m ? m.index : -1
}

function findLooseInvokeStart(s: string, from: number): number {
  const re = /\binvoke\s+name\s*=/gi
  re.lastIndex = from
  while (true) {
    const m = re.exec(s)
    if (!m) return -1
    const prev = m.index > 0 ? s[m.index - 1] : ""
    if (prev !== "<") return m.index
  }
}

function findControlTokenStart(s: string, from: number): number {
  // Fast paths for the known MiniMax / DeepSeek DSML leak patterns.
  const candidates = [
    s.indexOf("]<]", from),
    s.indexOf("]< ]", from),
    s.indexOf("<|", from),
    s.indexOf("[<", from),
    // DeepSeek DSML fullwidth bars: <｜｜DSML｜｜…>
    s.indexOf("<｜", from),
    s.indexOf("<||", from),
    // Stray close tags whose opener was consumed as part of a control token.
    s.indexOf("</tool_call>", from),
    s.indexOf("</invoke>", from),
    s.indexOf("/tool_call>", from),
    s.indexOf("/invoke>", from),
  ].filter((n) => n !== -1)
  if (candidates.length === 0) return -1
  return Math.min(...candidates)
}

function consumeControlToken(s: string): number {
  // Full match of a known control token at the head of `s`.
  CONTROL_TOKEN_RE.lastIndex = 0
  const m = CONTROL_TOKEN_RE.exec(s)
  if (m && m.index === 0) return m[0].length

  // Never consume DSML invoke/parameter/tool body tags as control — the
  // dsml-invoke pump path owns those so they become real tool calls.
  if (
    /^<｜{1,2}\s*DSML\s*｜{1,2}\s*(?:invoke|parameter|tool)\b/i.test(s) ||
    /^<\|\|\s*DSML\s*\|\|\s*(?:invoke|parameter|tool)\b/i.test(s) ||
    /^<\/｜{1,2}\s*DSML\s*｜{1,2}\s*(?:invoke|parameter|tool)\b/i.test(s) ||
    /^<\/\|\|\s*DSML\s*\|\|\s*(?:invoke|parameter|tool)\b/i.test(s)
  ) {
    return 0
  }

  // Structural DSML wrappers first: <｜DSML｜tool_calls>, </｜DSML｜>, etc.
  DSML_STRUCTURAL_RE.lastIndex = 0
  const structural = DSML_STRUCTURAL_RE.exec(s)
  if (structural && structural.index === 0) return structural[0].length

  // Other DSML special tokens (not invoke/parameter bodies).
  DSML_TOKEN_RE.lastIndex = 0
  const dsml = DSML_TOKEN_RE.exec(s)
  if (dsml && dsml.index === 0 && !isDsmlToolBodyTag(dsml[0])) {
    return dsml[0].length
  }

  // Incomplete DSML opener at end of chunk — hold for more bytes.
  // If it already looks like an invoke/tool body, leave it for the pump
  // (return 0 so control path doesn't steal it).
  if (/^<｜{1,2}/.test(s) || /^<\|\|/.test(s)) {
    const close = s.indexOf(">")
    if (close === -1) return -1
    const tag = s.slice(0, close + 1)
    if (isDsmlToolBodyTag(tag)) return 0
    return close + 1
  }

  // Partial / exact MiniMax junk: ]<]minimax[>[<tool_call>
  const mm = /^\]\s*<\s*\]\s*minimax\s*\[\s*>\s*(?:\[\s*<\s*tool_call\s*>)?/i.exec(s)
  if (mm) return mm[0].length

  // Stray close tag whose opener was already consumed by a control token.
  // Drop the tag (and any trailing `]` framing) silently.
  const strayClose = /^(?:<\/(?:tool_call|invoke)\s*>|\/(?:tool_call|invoke)\s*>)\s*\]?/i.exec(s)
  if (strayClose) return strayClose[0].length

  // `<|...|>` special tokens
  const pipe = /^<\|\s*[^|>]*\s*\|>/.exec(s)
  if (pipe) return pipe[0].length

  // Incomplete pipe token at end of chunk — signal hold.
  if (/^<\|\s*[^|>]*$/.test(s) || /^\]\s*<\s*\]\s*[a-z0-9_-]*$/i.test(s)) {
    return -1
  }

  // `[<tool_call>` without a closing counterpart — drop the opener tag only.
  const bare = /^\[\s*<\s*tool_call\s*>/i.exec(s)
  if (bare) return bare[0].length

  // Leading `]<]` that isn't a full token yet.
  if (/^\]\s*<\s*\]/.test(s) && s.length < 24) return -1

  // Unknown `]<]` — consume just those three chars so we don't wedge.
  if (s.startsWith("]<]")) return 3
  if (s.startsWith("<|")) {
    // Incomplete — hold
    return -1
  }
  if (s.startsWith("[<")) {
    if (s.length < 12) return -1
    return 2
  }
  return 0
}

function holdPartialOpener(tail: string): { emit: string; hold: string } {
  // If the tail could still grow into an opener, hold it.
  const holdPatterns = [
    /\[(?:T(?:O(?:O(?:L(?:_(?:C(?:A(?:L(?:L)?)?)?)?)?)?)?)?)?$/i,
    /<(?:t(?:o(?:o(?:l(?:_(?:c(?:a(?:l(?:l)?)?)?)?)?)?)?)?)?$/i,
    /<(?:i(?:n(?:v(?:o(?:k(?:e)?)?)?)?)?)?$/i,
    /\b(?:i|in|inv|invo|invok|invoke)(?:\s+(?:n|na|nam|name)(?:\s*=\s*(?:"[^"]*)?)?)?$/i,
    /\binvoke\s+name\s*=\s*(?:"[^"]*)?$/i,
    /\{\s*"(?:n(?:a(?:m(?:e)?)?)?|t(?:o(?:o(?:l)?)?)?)?"?\s*:?\s*$/,
    /\](?:<(?:\](?:m(?:i(?:n(?:i(?:m(?:a(?:x)?)?)?)?)?)?)?)?)?$/i,
    /<\|\s*[^|>]*$/,
    /\[<\s*[^>]*$/,
    // DeepSeek DSML openers (fullwidth or ASCII bars)
    /<｜{1,2}[^>]*$/,
    /<\|\|[^>]*$/,
  ]
  for (const re of holdPatterns) {
    const m = re.exec(tail)
    if (m && m.index !== undefined) {
      return { emit: tail.slice(0, m.index), hold: tail.slice(m.index) }
    }
  }
  return { emit: tail, hold: "" }
}

// Try to parse a JSON tool-call descriptor from the head of `s`. Returns:
//   - { complete: true, call, length }  — a full valid descriptor consumed
//   - { complete: false, incomplete: true } — descriptor started but stream
//     ended before the closing brace (hold for next chunk)
//   - null — not a descriptor (emit `{` and rescan)
function tryParseJsonDescriptor(
  s: string,
  knownTools: Set<string>,
):
  | { complete: true; call: EmbeddedToolCall; length: number }
  | { complete: false; incomplete: true }
  | null {
  // Find the matching closing `}` via a scan that respects nesting and string
  // literals, so embedded braces in argument strings don't confuse the match.
  const close = findBalancedClose(s)
  if (close === -1) {
    // We've already got an opener + `"name"`/`"tool"` — a closing brace will
    // arrive in a later chunk. Hold it.
    return { complete: false, incomplete: true }
  }
  const slice = s.slice(0, close + 1)
  let parsed: unknown
  try {
    parsed = JSON.parse(slice)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
  const obj = parsed as Record<string, unknown>
  const name =
    typeof obj.name === "string"
      ? obj.name
      : typeof obj.tool === "string"
        ? obj.tool
        : null
  if (!name || !knownTools.has(name)) return null

  // Nested args under common keys, OR top-level sibling fields (MiniMax M3).
  const nested = obj.parameters ?? obj.arguments ?? obj.args ?? obj.input
  let args: Record<string, unknown>
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    args = nested as Record<string, unknown>
  } else {
    args = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === "name" || k === "tool" || k === "id" || k === "type") continue
      // Skip nested containers we already considered empty/invalid.
      if (k === "parameters" || k === "arguments" || k === "args" || k === "input") continue
      args[k] = v
    }
    // A descriptor with only a name/tool and no args is still a tool call
    // (some tools take zero args). Keep it.
  }

  return {
    complete: true,
    call: { name, args, id: typeof obj.id === "string" ? obj.id : "" },
    length: slice.length,
  }
}

// Find the index of the `}` that closes the first top-level object in `s`,
// respecting double-quoted string literals (so escaped braces inside strings
// don't count). Returns -1 if the object never closes.
function findBalancedClose(s: string): number {
  let depth = 0
  let inString = false
  let escaped = false
  for (let idx = 0; idx < s.length; idx++) {
    const ch = s[idx]
    if (inString) {
      if (escaped) {
        escaped = false
        continue
      }
      if (ch === "\\") {
        escaped = true
        continue
      }
      if (ch === '"') inString = false
      continue
    }
    if (ch === '"') {
      inString = true
      continue
    }
    if (ch === "{") depth++
    else if (ch === "}") {
      depth--
      if (depth === 0) return idx
    }
  }
  return -1
}

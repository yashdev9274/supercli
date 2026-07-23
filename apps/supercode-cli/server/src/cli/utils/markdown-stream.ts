import { marked, lexer } from "marked"
import TerminalRenderer from "marked-terminal"
import { theme } from "./tui"
import chalk from "chalk"
import type { MarkedTerminalOptions } from "marked-terminal"

//
// Streaming markdown renderer.
//
// Default behaviour (buffer-only):
//   1. `push(chunk)` buffers each streamed chunk without writing to
//      stdout. The user sees nothing live — just the spinner / Thought
//      blocks emitted by the rest of the TUI.
//   2. `end()` runs the buffered markdown through marked-terminal with
//      the supercode palette and writes the styled, terminal-ready
//      result to stdout exactly once.
//
// Legacy behaviour (opt in via `enableLiveMode()`):
//   1. `push(chunk)` ALSO writes the chunk to stdout live so the user
//      sees the response appearing as it streams (literal `**`, `#`,
//      etc. visible — accepted tradeoff).
//   2. `end()` emits the styled render on a fresh line below the raw
//      transcript.
//
// We deliberately do NOT try to erase the raw streamed content with
// cursor walks. The supercode TUI sets a DECSTBM scroll region around
// the PersistentStatusBar's reserved footer row, so any cursor math
// that disagrees with the terminal's auto-scroll silently erases the
// wrong lines. The earlier "rewrite-in-place" version of this code
// produced two symptoms: (a) the response appearing then vanishing as
// `\x1b[0J` cleared the footer region, and (b) the response being
// emitted twice — once raw, then once styled — because the rewrite
// logic had been stripped.
//

function buildStyle(width: number): MarkedTerminalOptions {
  const dim = (s: string) => chalk.hex(theme.greenDim)(s)
  const green = (s: string) => chalk.hex(theme.green)(s)
  const glow = (s: string) => chalk.hex(theme.greenGlow)(s)
  const amber = (s: string) => chalk.hex(theme.amber)(s)

  return {
    heading: green,
    firstHeading: (text: string) => green(chalk.bold.underline(text)),
    hr: () => dim("─".repeat(Math.max(10, Math.min(width, 60)))),
    blockquote: (text: string) => dim(`┃ ${text}`),
    listitem: (text: string) => `  ${green("◆")} ${text}`,
    list: (text: string) => text,
    paragraph: (text: string) => text,
    strong: (text: string) => chalk.bold(glow(text)),
    em: (text: string) => chalk.italic(green(text)),
    codespan: (text: string) => amber(text),
    del: (text: string) => dim(text),
    link: (text: string) => glow(text),
    href: (text: string) => dim(text),
    code: (text: string) => amber(text),
    text: (text: string) => text,
    table: (text: string) => text,
    unescape: true,
    emoji: false,
    width,
    reflowText: false,
    showSectionPrefix: false,
    tab: 2,
    // marked-terminal's types expect ChalkInstance values for color keys,
    // but plain string-returning functions also work at runtime. Cast to
    // any to bypass the strict type check while keeping the actual
    // runtime contract.
  } as unknown as MarkedTerminalOptions
}

let cachedRenderer: TerminalRenderer | null = null
let cachedWidth = -1
function getRenderer(width: number): TerminalRenderer {
  if (cachedRenderer && cachedWidth === width) return cachedRenderer
  const renderer = new TerminalRenderer(buildStyle(width))
  const origListitem = (renderer as any).listitem.bind(renderer)
  ;(renderer as any).listitem = function (text: any) {
    const inner = origListitem(text)
    if (typeof text === "object") {
      return inner.replace(/^\n\s*\*\s+/, "\n")
    }
    return inner.replace(/^\s*\*\s+/, "")
  }
  const origList = (renderer as any).list.bind(renderer)
  ;(renderer as any).list = function (body: any) {
    const out = origList(body)
    return out.replace(/^ {2,4}/gm, "")
  }
  cachedRenderer = renderer
  cachedWidth = width
  return cachedRenderer
}

export class MarkdownStream {
  private buffer = ""
  private closed = false
  // When true, push() ALSO writes the chunk to stdout live (live
  // transcript). Default false — the user sees nothing until end()
  // emits the styled markdown. Defaulting to off prevents the response
  // from showing up twice (once as raw text, once as styled markdown).
  private liveMode = false
  // Fallback content captured from the chat loop's fullResponse variable.
  // Used when the buffer is empty but the model did generate text.
  private fallbackContent = ""

  // Opt into the legacy live-transcript behaviour where chunks are
  // written to stdout as they arrive and the styled render sits below.
  // Most code paths don't want this; chat.ts uses it implicitly via
  // the spinner, so the chat loop reads as a single styled response.
  enableLiveMode(): this {
    this.liveMode = true
    return this
  }

  push(chunk: string) {
    if (this.closed || !chunk) return
    this.buffer += chunk
    if (this.liveMode) {
      process.stdout.write(chunk)
    }
  }

  // Set fallback content from the chat loop's fullResponse. Used when
  // the buffer is empty but the model did generate text (edge case where
  // chunks weren't pushed to the buffer but were captured in fullResponse).
  setFallback(content: string) {
    this.fallbackContent = content
  }

  end() {
    if (this.closed) return
    this.closed = true
    return this.renderStyled()
  }

  // Render the buffered markdown all at once, without the typing animation.
  // Used for the end-of-turn Result section where the text was already
  // streamed inline — no need to animate it character by character.
  endInstant() {
    if (this.closed) return
    this.closed = true
    const content = this.buffer || this.fallbackContent
    if (!content) return
    const width = (process.stdout.columns ?? 80) - 2
    const renderer = getRenderer(width)
    let rendered = marked(content, { renderer: renderer as any, async: false }) as string
    rendered = rendered.replace(/\n+$/, "")
    if (!rendered) return
    process.stdout.write(rendered.endsWith("\n") ? rendered : rendered + "\n")
  }

  reset() {
    this.buffer = ""
    this.fallbackContent = ""
    this.closed = false
  }

  // Run the buffered response through marked-terminal with the
  // supercode palette and write the styled result to stdout with a
  // typing animation so the user sees content appearing progressively.
  // Writes in line-sized chunks so each ANSI escape sequence stays
  // intact — character-by-character output would let the spinner's
  // interval writes corrupt in-progress escape sequences.
  private async renderStyled() {
    // Use buffer if available, otherwise fall back to fallbackContent
    const content = this.buffer || this.fallbackContent
    if (!content) return
    const width = (process.stdout.columns ?? 80) - 2
    const renderer = getRenderer(width)
    let rendered = marked(content, { renderer: renderer as any, async: false }) as string
    rendered = rendered.replace(/\n+$/, "")
    if (!rendered) return

    const styledPayload = rendered.endsWith("\n") ? rendered : rendered + "\n"

    if (this.liveMode) {
      process.stdout.write("\r\n")
    }

    // Split into lines — each line contains complete ANSI sequences.
    // Write line by line with a delay between each for the typing feel.
    const lines = styledPayload.split("\n")
    const delay =
      lines.length < 10 ? 40
      : lines.length < 30 ? 25
      : 15

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]!
      if (line) {
        process.stdout.write(line)
      }
      process.stdout.write("\n")
      await new Promise((r) => setTimeout(r, delay))
    }
    // Last line (may be empty if input ended with \n)
    const last = lines[lines.length - 1]
    if (last && last.length > 0) {
      process.stdout.write(last)
      // No trailing \n — the turn footer will add one
    }
  }
}

import { marked, lexer } from "marked"
import TerminalRenderer from "marked-terminal"
import { theme } from "./tui"
import chalk from "chalk"
import type { MarkedTerminalOptions } from "marked-terminal"

//
// Streaming markdown renderer.
//
// Strategy (delayed render):
//   1. Buffer accumulates streaming chunks. We write raw text to stdout so
//      the user sees the response appearing live (literal `**`, `#`, etc.
//      are visible during streaming — accepted tradeoff).
//   2. When `end()` is called (stream complete), we render the entire
//      buffer via marked-terminal styled with the supercode palette.
//   3. Use ANSI cursor tricks (\x1b[nA to move up, \r to col 0, \x1b[0J to
//      clear from cursor to end) to rewrite the just-printed raw lines
//      with the styled version.
//
// Trade-off accepted: user sees literal markdown during streaming, but the
// final render is clean and styled. Alternative (incremental diff) is fragile
// because ANSI codes interleave with visible chars and re-rendering inline
// markup mid-stream is fundamentally hard.
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
  private linesWritten = 0
  private closed = false

  push(chunk: string) {
    if (this.closed || !chunk) return
    this.buffer += chunk
    this.streamRaw(chunk)
  }

  end() {
    if (this.closed) return
    this.closed = true
    this.renderAndRewrite()
  }

  reset() {
    this.buffer = ""
    this.linesWritten = 0
    this.closed = false
  }

  // During streaming, write raw text and track how many lines we've emitted.
  // ANSI codes inside the chunk are passed through unchanged.
  private streamRaw(chunk: string) {
    process.stdout.write(chunk)
    // Count newlines in the chunk so we know how many lines to overwrite later.
    for (let i = 0; i < chunk.length; i++) {
      if (chunk[i] === "\n") this.linesWritten++
    }
  }

  // After streaming is complete, re-render the entire buffer with proper
  // styling and rewrite the lines we already wrote.
  private renderAndRewrite() {
    if (!this.buffer || this.linesWritten === 0) return
    const width = (process.stdout.columns ?? 80) - 2
    const renderer = getRenderer(width)
    let rendered = marked(this.buffer, { renderer: renderer as any, async: false }) as string
    rendered = rendered.replace(/\n+$/, "")
    if (!rendered) return

    // Move cursor up by linesWritten, then to col 0, then clear from
    // cursor to end of screen. Inside the PersistentStatusBar's scroll
    // region this clears the streaming content; the status row below is
    // outside the scroll region so it's untouched.
    if (this.linesWritten > 0) {
      process.stdout.write(`\x1b[${this.linesWritten}A`)
    }
    process.stdout.write("\r")
    process.stdout.write("\x1b[0J")
    process.stdout.write(rendered)
    if (!rendered.endsWith("\n")) process.stdout.write("\n")
  }
}
import { marked } from "marked"
import TerminalRenderer from "marked-terminal"
import { stripAnsi, theme } from "./tui"
import chalk from "chalk"
import type { MarkedTerminalOptions } from "marked-terminal"

//
// Streaming markdown renderer for final Result output.
//
// Default behaviour (buffer-only):
//   1. `push(chunk)` buffers each streamed chunk without writing to stdout.
//   2. `end()` runs the buffered markdown through marked-terminal with the
//      supercode palette and writes the styled result once.
//
// Live mode (opt-in via enableLiveMode): also writes raw chunks as they arrive.
// We do NOT rewrite-in-place — DECSTBM scroll regions make cursor math unsafe.
//

function contentWidth(requested?: number): number {
  if (typeof requested === "number" && requested > 0) return requested
  return Math.max(40, Math.min((process.stdout.columns ?? 80) - 2, 110))
}

function fenceBlock(label: string, body: string, width: number, accent = theme.greenDim): string {
  const labelPart = label ? ` ${label} ` : ""
  const fill = Math.max(0, width - stripAnsi(labelPart).length - 2)
  const top = chalk.hex(accent)(`┌${labelPart}${"─".repeat(fill)}┐`)
  const bottom = chalk.hex(accent)(`└${"─".repeat(Math.max(0, width - 2))}┘`)
  const lines = body.replace(/\s+$/u, "").split("\n")
  const framed = lines.map((line) => {
    const visible = stripAnsi(line).length
    const clipped =
      visible > width - 4
        ? `${stripAnsi(line).slice(0, Math.max(1, width - 5))}…`
        : line
    const clipPad = Math.max(0, width - 4 - stripAnsi(clipped).length)
    return `${chalk.hex(accent)("│")} ${clipped}${" ".repeat(clipPad)} ${chalk.hex(accent)("│")}`
  })
  return [top, ...framed, bottom].join("\n")
}

function tokenText(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "object") {
    const v = value as Record<string, unknown>
    if (typeof v.text === "string") return v.text
    if (typeof v.raw === "string") return v.raw
  }
  return String(value)
}

function buildStyle(width: number): MarkedTerminalOptions {
  const dim = (s: string) => chalk.hex(theme.greenDim)(s)
  const green = (s: string) => chalk.hex(theme.green)(s)
  const glow = (s: string) => chalk.hex(theme.greenGlow)(s)
  const amber = (s: string) => chalk.hex(theme.amber)(s)
  const mute = (s: string) => chalk.hex(theme.greenMute)(s)

  return {
    // Headings — level-aware styling is applied via heading override in getRenderer
    firstHeading: (text: string) => {
      const t = stripAnsi(tokenText(text)).trim()
      const rule = dim("━".repeat(Math.min(width, Math.max(12, t.length + 4))))
      return `\n${green(chalk.bold(t))}\n${rule}\n`
    },
    heading: (text: string) => {
      const t = stripAnsi(tokenText(text)).trim()
      return `\n${glow(chalk.bold(t))}\n${dim("─".repeat(Math.min(width, Math.max(8, t.length))))}\n`
    },
    hr: () => `\n${dim("─".repeat(Math.max(10, Math.min(width, 48))))}\n`,
    blockquote: (text: string) => {
      const body = stripAnsi(tokenText(text))
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `${dim("┃")} ${mute(chalk.italic(l))}`)
        .join("\n")
      return `\n${body}\n`
    },
    // marked v18 passes token objects; listitem/list/code handle that in getRenderer
    paragraph: (text: string) => `${tokenText(text).trim()}\n\n`,
    strong: (text: string) => chalk.bold(glow(tokenText(text))),
    em: (text: string) => chalk.italic(mute(tokenText(text))),
    codespan: (text: string) => chalk.bgHex("#1a2e1a").hex(theme.amber)(` ${tokenText(text)} `),
    del: (text: string) => dim(tokenText(text)),
    link: (href: string, _title: string | null | undefined, text?: string) => {
      if (text == null || text === "") return glow(tokenText(href))
      return `${glow(chalk.underline(tokenText(text)))}${dim(` ⟨${tokenText(href)}⟩`)}`
    },
    href: (text: string) => dim(tokenText(text)),
    text: (text: string) => tokenText(text),
    unescape: true,
    emoji: false,
    width,
    reflowText: true,
    showSectionPrefix: false,
    tab: 2,
  } as unknown as MarkedTerminalOptions
}

let cachedRenderer: TerminalRenderer | null = null
let cachedWidth = -1

function getRenderer(width: number): TerminalRenderer {
  if (cachedRenderer && cachedWidth === width) return cachedRenderer
  const renderer = new TerminalRenderer(buildStyle(width))
  const amber = (s: string) => chalk.hex(theme.amber)(s)

  // marked v18 passes list tokens with items[]; render bullets ourselves.
  ;(renderer as any).listitem = function (item: any) {
    const text = tokenText(item).trim()
    return `  ${amber("•")} ${text}\n`
  }
  ;(renderer as any).list = function (token: any) {
    if (token && typeof token === "object" && Array.isArray(token.items)) {
      const ordered = Boolean(token.ordered)
      const start = typeof token.start === "number" ? token.start : 1
      const lines = token.items.map((item: any, idx: number) => {
        const text = tokenText(item).trim()
        const marker = ordered ? chalk.hex(theme.amber)(`${start + idx}.`) : amber("•")
        return `  ${marker} ${text}`
      })
      return `\n${lines.join("\n")}\n\n`
    }
    const body = typeof token === "string" ? token : tokenText(token)
    const cleaned = String(body).replace(/\n{3,}/g, "\n").trimEnd()
    return `\n${cleaned}\n\n`
  }

  // Code fence: marked v18 passes a code token object { text, lang }
  ;(renderer as any).code = function (token: any) {
    const lang = typeof token === "object" && token?.lang ? String(token.lang) : typeof arguments[1] === "string" ? arguments[1] : "code"
    const code = typeof token === "object" && token?.text != null ? String(token.text) : tokenText(token)
    const body = code
      .replace(/\s+$/u, "")
      .split("\n")
      .map((line: string) => chalk.hex("#c8e6c9")(line))
      .join("\n")
    return `\n${fenceBlock(lang || "code", body || " ", width)}\n\n`
  }

  // Level-aware headings when marked passes depth/token
  ;(renderer as any).heading = function (token: any, level?: number) {
    const raw = tokenText(token)
    const lvl =
      typeof level === "number"
        ? level
        : typeof token === "object" && token?.depth
          ? Number(token.depth)
          : 2
    const t = stripAnsi(raw).trim()
    if (lvl <= 1) {
      const rule = chalk.hex(theme.greenDim)("━".repeat(Math.min(width, Math.max(12, t.length + 4))))
      return `\n${chalk.hex(theme.green).bold(t)}\n${rule}\n`
    }
    if (lvl === 2) {
      return `\n${chalk.hex(theme.greenGlow).bold(t)}\n${chalk.hex(theme.greenDim)("─".repeat(Math.min(width, Math.max(8, t.length))))}\n`
    }
    if (lvl === 3) {
      return `\n${chalk.hex(theme.amber).bold(`▸ ${t}`)}\n`
    }
    return `\n${chalk.hex(theme.greenMute).bold(t)}\n`
  }

  // Soft-color default cli-table3 output while keeping its geometry
  const origTable = (renderer as any).table?.bind(renderer)
  if (origTable) {
    ;(renderer as any).table = function (header: any, body?: any) {
      const out = String(origTable(header, body) ?? "")
      return `\n${out
        .split("\n")
        .map((line: string) => {
          if (!line) return line
          return line.replace(/[┌┐└┘├┤┬┴┼─│]/g, (ch) => chalk.hex(theme.greenDim)(ch))
        })
        .join("\n")
        .trimEnd()}\n\n`
    }
  }

  cachedRenderer = renderer
  cachedWidth = width
  return cachedRenderer
}

function renderMarkdown(content: string, width?: number): string {
  const w = contentWidth(width)
  const renderer = getRenderer(w)
  let rendered = marked(content, { renderer: renderer as any, async: false }) as string
  rendered = rendered.replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "")
  return rendered
}

/** Render markdown to a terminal-styled string without printing. */
export function renderMarkdownToTerminal(md: string, width?: number): string {
  return renderMarkdown(md, width)
}

/** Print a Result section header above final answer markdown. */
export function printResultHeader(): void {
  const w = process.stdout.columns ?? 80
  const dim = (s: string) => chalk.hex(theme.greenDim)(s)
  const label = chalk.hex(theme.green).bold("Result")
  const fill = Math.max(0, w - stripAnsi(` ┃ Result `).length - 1)
  console.log(` ${chalk.hex(theme.green)("┃")} ${label} ${dim("─".repeat(fill))}`)
}

export class MarkdownStream {
  private buffer = ""
  private closed = false
  private liveMode = false
  private fallbackContent = ""
  private showResultChrome = false

  enableLiveMode(): this {
    this.liveMode = true
    return this
  }

  /** Prefix the final render with a Result rail header. */
  withResultHeader(enabled = true): this {
    this.showResultChrome = enabled
    return this
  }

  push(chunk: string) {
    if (this.closed || !chunk) return
    this.buffer += chunk
    if (this.liveMode) {
      process.stdout.write(chunk)
    }
  }

  setFallback(content: string) {
    this.fallbackContent = content
  }

  get hasContent(): boolean {
    return (this.buffer || this.fallbackContent).trim().length > 0
  }

  end() {
    if (this.closed) return
    this.closed = true
    return this.renderStyled()
  }

  endInstant() {
    if (this.closed) return
    this.closed = true
    const content = this.buffer || this.fallbackContent
    if (!content.trim()) return
    if (this.showResultChrome) printResultHeader()
    const rendered = renderMarkdown(content)
    if (!rendered) return
    const gutter = chalk.hex(theme.green)("┃")
    for (const line of rendered.split("\n")) {
      process.stdout.write(` ${gutter} ${line}\n`)
    }
  }

  reset() {
    this.buffer = ""
    this.fallbackContent = ""
    this.closed = false
  }

  private async renderStyled() {
    const content = this.buffer || this.fallbackContent
    if (!content.trim()) return
    const rendered = renderMarkdown(content)
    if (!rendered) return

    if (this.liveMode) {
      process.stdout.write("\r\n")
    }

    if (this.showResultChrome) {
      printResultHeader()
    }

    const gutter = this.showResultChrome ? chalk.hex(theme.green)("┃") : ""
    const styledPayload = rendered.endsWith("\n") ? rendered : rendered + "\n"
    const lines = styledPayload.split("\n")
    const delay =
      lines.length < 10 ? 28
      : lines.length < 30 ? 16
      : 10

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i]!
      if (gutter) process.stdout.write(` ${gutter} ${line}`)
      else if (line) process.stdout.write(line)
      process.stdout.write("\n")
      await new Promise((r) => setTimeout(r, delay))
    }
    const last = lines[lines.length - 1]
    if (last && last.length > 0) {
      if (gutter) process.stdout.write(` ${gutter} ${last}`)
      else process.stdout.write(last)
    }
  }
}

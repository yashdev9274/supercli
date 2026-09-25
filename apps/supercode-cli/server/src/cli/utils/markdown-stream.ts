import { Chalk } from "chalk"
import { layoutMarkdown, type MarkdownSpan } from "./markdown-layout"

function palette() {
  return new Chalk({ level: process.stdout.isTTY && process.env.NO_COLOR === undefined ? 1 : 0 })
}
function styled(s: MarkdownSpan): string {
  const c = palette()
  switch (s.style) {
    case "heading": return c.green.bold(s.text)
    case "strong": return c.bold(s.text)
    case "em": return c.italic(s.text)
    case "code": return c.yellow(s.text)
    case "link": return c.cyan.underline(s.text)
    case "muted": return c.dim(s.text)
    default: return s.text
  }
}
export function renderMarkdownToTerminal(md: string, width = process.stdout.columns ?? 80): string {
  return layoutMarkdown(md, width).map((line) => line.map(styled).join("")).join("\n")
}
export function printResultHeader(): void {
  process.stdout.write(palette().green.bold("RESULT") + "\n")
}

/** Buffer incomplete constructs; commit once at a tool boundary or completion. */
export class MarkdownStream {
  private buffer = ""
  private closed = false
  private fallbackContent = ""
  private showResultChrome = false
  enableLiveMode(): this { return this }
  withResultHeader(enabled = true): this { this.showResultChrome = enabled; return this }
  push(chunk: string): void { if (!this.closed) this.buffer += chunk }
  setFallback(content: string): void { this.fallbackContent = content }
  get hasContent(): boolean { return (this.buffer || this.fallbackContent).trim().length > 0 }
  /** Commit assistant intent without a final-result heading, then start a new segment. */
  flush(): string {
    const content = this.buffer
    if (content.trim()) this.write(content, false)
    this.buffer = ""
    this.fallbackContent = ""
    return content
  }
  end(): void { this.endInstant() }
  endInstant(): void {
    if (this.closed) return
    this.closed = true
    this.write(this.buffer || this.fallbackContent, this.showResultChrome)
  }
  reset(): void { this.buffer = ""; this.fallbackContent = ""; this.closed = false }
  private write(content: string, chrome: boolean): void {
    if (!content.trim()) return
    const gutter = chrome ? " │ " : ""
    const rendered = renderMarkdownToTerminal(content, Math.max(2, (process.stdout.columns ?? 80) - gutter.length))
    const payload = rendered.split("\n").map((line) => gutter + line).join("\n")
    process.stdout.write((chrome ? palette().green.bold("RESULT") + "\n" : "") + payload + "\n")
  }
}

import { marked, type Token } from "marked"
import { sanitizeTerminalText, terminalCells, wrapTerminalText } from "./terminal-text"

export type MarkdownStyle = "plain" | "strong" | "em" | "code" | "link" | "muted" | "heading"
export type MarkdownSpan = { text: string; style: MarkdownStyle }
export type MarkdownLine = MarkdownSpan[]
const span = (text: string, style: MarkdownStyle = "plain"): MarkdownSpan => ({ text, style })

function inline(tokens: Token[] = [], inherited: MarkdownStyle = "plain"): MarkdownSpan[] {
  return tokens.flatMap((token): MarkdownSpan[] => {
    switch (token.type) {
      case "strong": return inline(token.tokens, "strong")
      case "em": return inline(token.tokens, "em")
      case "del": return inline(token.tokens, "muted")
      case "codespan": return [span(token.text, "code")]
      case "br": return [span("\n")]
      case "link": return [...inline(token.tokens, "link"), ...(token.text === token.href ? [] : [span(` <${token.href}>`, "muted")])]
      case "image": return [span(`${token.text} <${token.href}>`, "link")]
      case "escape": return [span(token.text, inherited)]
      default: return "tokens" in token && token.tokens ? inline(token.tokens, inherited) : [span("text" in token ? String(token.text) : token.raw, inherited)]
    }
  })
}

function wrapSpans(spans: MarkdownSpan[], width: number): MarkdownLine[] {
  const lines: MarkdownLine[] = [[]]
  let cells = 0
  const limit = Math.max(2, width)
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  for (const s of spans) {
    for (const { segment } of segmenter.segment(s.text)) {
      const size = terminalCells(segment)
      if (segment === "\n" || (cells + size > limit && cells > 0)) {
        lines.push([])
        cells = 0
        if (segment === "\n") continue
      }
      const line = lines[lines.length - 1]!
      const last = line[line.length - 1]
      if (last?.style === s.style) last.text += segment
      else line.push(span(segment, s.style))
      cells += size
    }
  }
  return lines
}

function blocks(tokens: Token[] = [], width = 80): MarkdownLine[] {
  const out: MarkdownLine[] = []
  for (const token of tokens) {
    switch (token.type) {
      case "space": break
      case "heading":
        out.push(...wrapSpans(inline(token.tokens, "heading"), width), [span("─".repeat(Math.min(width, terminalCells(token.text))), "muted")], [])
        break
      case "paragraph":
      case "text":
        out.push(...wrapSpans(token.tokens ? inline(token.tokens) : [span(token.text)], width), [])
        break
      case "list": {
        token.items.forEach((item: any, index: number) => {
          const marker = `${token.ordered ? `${Number(token.start) + index}.` : "•"} ${item.task ? `[${item.checked ? "x" : " "}] ` : ""}`
          const indent = " ".repeat(terminalCells(marker))
          const content = blocks(item.tokens.filter((t: Token) => t.type !== "checkbox"), Math.max(2, width - terminalCells(marker)))
          while (content.length && !content[content.length - 1]!.length) content.pop()
          out.push(...content.map((line, i) => [span(i ? indent : marker, "muted"), ...line]))
        })
        out.push([])
        break
      }
      case "blockquote":
        out.push(...blocks(token.tokens, width - 2).map((line) => [span("│ ", "muted"), ...line]), [])
        break
      case "code": {
        out.push(...wrapTerminalText(`┌ ${token.lang || "code"}`, width).map((s) => [span(s, "muted")]))
        for (const line of token.text.split("\n")) {
          out.push(...wrapTerminalText(line, width - 2).map((s, i) => [span(i ? "↪ " : "│ ", "muted"), span(s, "code")]))
        }
        out.push([span("└" + "─".repeat(Math.max(0, width - 1)), "muted")], [])
        break
      }
      case "table": {
        const rows = [token.header, ...token.rows].map((row: any[]) => row.map((cell) => inline(cell.tokens)))
        const sizes = token.header.map((_: unknown, i: number) => Math.max(...rows.map((row) => terminalCells(row[i]!.map((s: MarkdownSpan) => s.text).join("")))))
        if (sizes.reduce((n: number, size: number) => n + size, 0) + (sizes.length - 1) * 3 <= width) {
          rows.forEach((row, r) => {
            const line: MarkdownLine = []
            row.forEach((cell: MarkdownSpan[], c: number) => {
              if (c) line.push(span(" │ ", "muted"))
              line.push(...cell, span(" ".repeat(sizes[c]! - terminalCells(cell.map((s) => s.text).join("")))))
            })
            out.push(line)
            if (!r) out.push([span("─".repeat(sizes.reduce((n: number, s: number) => n + s, 0) + (sizes.length - 1) * 3), "muted")])
          })
        } else {
          for (const row of rows.slice(1)) {
            row.forEach((cell: MarkdownSpan[], c: number) => out.push(...wrapSpans([...rows[0]![c]!, span(": ", "muted"), ...cell], width)))
            out.push([])
          }
          if (rows.length === 1) out.push(...wrapSpans(rows[0]!.flat(), width))
        }
        out.push([])
        break
      }
      case "hr": out.push([span("─".repeat(width), "muted")], []); break
      default: out.push(...wrapSpans([span(token.raw)], width), [])
    }
  }
  while (out.length && !out[out.length - 1]!.length) out.pop()
  return out
}

export function layoutMarkdown(content: string, width = 80): MarkdownLine[] {
  return blocks(marked.lexer(sanitizeTerminalText(content), { gfm: true }), Math.max(2, Math.floor(width)))
}

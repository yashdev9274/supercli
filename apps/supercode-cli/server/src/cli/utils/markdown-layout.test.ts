import { describe, expect, test, spyOn } from "bun:test"
import { layoutMarkdown } from "./markdown-layout"
import { MarkdownStream, renderMarkdownToTerminal } from "./markdown-stream"
import { sanitizeTerminalText, terminalCells } from "./terminal-text"

describe("terminal Markdown", () => {
  const fixture = "# Heading\n\n1. **Bold** and *italic*\n   - Nested `code`\n   - [x] Task\n\n> Quote [docs](https://example.com)\n\n| Name | Description |\n| --- | --- |\n| 漢字 | Long table cell with emoji 👩‍💻 and more content |\n\n```ts\n  const value = 'abcdefghijklmnopqrstuvwxyz0123456789'\n```"
  test("nested lists and inline spans retain semantics", () => {
    const lines = layoutMarkdown(fixture)
    const plain = lines.map((l) => l.map((s) => s.text).join("")).join("\n")
    expect(plain).toContain("1. Bold and italic")
    expect(plain).toContain("  • Nested code")
    expect(plain).toContain("[x] Task")
    expect(plain).toContain("https://example.com")
    expect(lines.flat().some((s) => s.text === "Bold" && s.style === "strong")).toBe(true)
  })
  test("narrow, normal and wide layouts fit terminal cells", () => {
    for (const width of [16, 40, 80, 120]) {
      for (const line of layoutMarkdown(fixture, width)) expect(terminalCells(line.map((s) => s.text).join(""))).toBeLessThanOrEqual(width)
    }
  })
  test("long code and incomplete fences never silently drop content or indentation", () => {
    const code = "    abcdefghijklmnopqrstuvwxyz漢字👩‍💻é  "
    for (const width of [12, 30, 80]) {
      const lines = layoutMarkdown("```ts\n" + code, width)
      expect(lines.flat().filter((s) => s.style === "code").map((s) => s.text).join("")).toBe(code)
    }
  })
  test("terminal controls are stripped and Unicode cells are counted", () => {
    expect(sanitizeTerminalText("hello\x1b[2J\x1b]0;evil\x07world\r\x00")).toBe("helloworld")
    expect(terminalCells("漢字👩‍💻é")).toBe(7)
    expect(renderMarkdownToTerminal("hello\x1b[2Jworld")).not.toContain("\x1b")
  })
  test("live mode, intent flush, repeated end and interruption fallback never replay text", () => {
    const writes: string[] = []
    const write = spyOn(process.stdout, "write").mockImplementation(((chunk: unknown) => { writes.push(String(chunk)); return true }) as any)
    try {
      const md = new MarkdownStream().withResultHeader().enableLiveMode()
      md.push("I will inspect **files**.")
      expect(writes).toHaveLength(0)
      md.flush()
      md.push("```ts\npartial")
      md.setFallback("wrong fallback")
      md.end()
      md.endInstant()
      const out = writes.join("")
      expect(out.match(/I will inspect/g)).toHaveLength(1)
      expect(out.match(/partial/g)).toHaveLength(1)
      expect(out.match(/RESULT/g)).toHaveLength(1)
      expect(out).not.toContain("wrong fallback")
    } finally { write.mockRestore() }
  })
})

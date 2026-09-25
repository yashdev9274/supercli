import { describe, expect, test } from "bun:test"
import { normalizeToolResult, renderToolBlock, ToolTranscript, toolCategory } from "./tool-presentation"
import { terminalCells } from "./terminal-text"
import { TOOL_CATEGORY_FIXTURES } from "./tool-category-fixtures"

describe("tool presentation", () => {
  test("every alias renders running, completed, failed, denied and cancelled", () => {
    for (const [name, category] of TOOL_CATEGORY_FIXTURES) {
      for (const [status, result] of [
        ["completed", { success: true, data: { content: "fixture" } }],
        ["failed", { success: false, error: "fixture failure" }],
        ["denied", { success: false, error: "Permission denied" }],
        ["cancelled", { success: false, cancelled: true }],
      ] as const) {
        const transcript = new ToolTranscript()
        const args = { path: "fixture", command: "fixture", content: "fixture", oldText: "a", newText: "b" }
        const call = transcript.start(name, args, "id", 0)
        expect(call.category).toBe(category)
        expect(renderToolBlock(call, { now: 0 })).toContain("running")
        transcript.finish(name, args, result, "id", 100)
        expect(call.status).toBe(status)
        expect(renderToolBlock(call)).toContain(category)
        expect(renderToolBlock(call)).toContain(status)
        expect(transcript.calls).toHaveLength(1)
      }
    }
  })
  test("READ aliases without a path still show the requested operation", () => {
    expect(renderToolBlock(new ToolTranscript().start("skill", { name: "review" }))).toContain("review")
    expect(renderToolBlock(new ToolTranscript().start("read_instructions", {}))).toContain("read_instructions")
  })
  test("categories remain distinct and unknown tools keep their exact names", () => {
    const names = ["run_command", "read_file", "write_file", "edit_file", "search_files", "list_files", "web_search", "web_fetch", "delegate", "question", "todowrite", "mcp_custom"]
    expect(names.map(toolCategory)).toEqual(["SHELL", "READ", "WRITE", "EDIT", "FILE SEARCH", "FILE LIST", "WEB SEARCH", "WEB FETCH", "AGENT", "QUESTION", "TASKS", "TOOL"])
    expect(renderToolBlock(new ToolTranscript().start("mcp_custom"))).toContain("mcp_custom")
  })
  test("out-of-order completions are attached by ID, not the last row", () => {
    const t = new ToolTranscript()
    t.start("read_file", { path: "a" }, "a", 0)
    t.start("read_file", { path: "b" }, "b", 10)
    t.finish("read_file", {}, { success: true, data: { content: "B" } }, "b", 20)
    t.finish("read_file", {}, { success: true, data: { content: "A" } }, "a", 30)
    expect(t.calls.map((c) => [c.id, c.output, c.endedAt])).toEqual([["a", "A", 30], ["b", "B", 20]])
  })
  test("legacy matching uses stable arguments and FIFO for identical invocations", () => {
    const t = new ToolTranscript()
    t.start("read_file", { path: "a", startLine: 1 })
    t.start("read_file", { path: "b" })
    t.finish("read_file", { startLine: 1, path: "a" }, "A")
    expect(t.calls[0]!.output).toBe("A")
    expect(t.calls[1]!.status).toBe("running")
    t.start("read_file", { path: "b" })
    t.finish("read_file", { path: "b" }, "B")
    expect(t.calls[1]!.output).toBe("B")
    expect(t.calls[2]!.status).toBe("running")
  })
  test("empty results succeed; denial, cancellation and failures are explicit", () => {
    expect(normalizeToolResult("read_file", {}, { success: true, data: { content: "" } })).toMatchObject({ status: "completed", output: "Empty file" })
    expect(normalizeToolResult("search_files", {}, { success: true, data: { matches: [] } })).toMatchObject({ status: "completed", output: "No matches" })
    expect(normalizeToolResult("edit_file", {}, { success: false, cancelled: true, reason: "Permission denied" }).status).toBe("denied")
    expect(normalizeToolResult("run_command", {}, { success: false, data: { cancelled: true, stdout: "partial", exitCode: null } })).toMatchObject({ status: "cancelled", output: "partial" })
    expect(normalizeToolResult("run_command", {}, { data: { stderr: "bad", exitCode: 2 } })).toMatchObject({ status: "failed", output: "stderr:\nbad" })
    expect(normalizeToolResult("run_command", {}, { data: { stdout: "x" } }).references).toContain("exit: unknown")
    expect(normalizeToolResult("mcp", {}, { isError: true, content: [{ text: "bad" }] }).status).toBe("failed")
  })
  test("successful replacement excerpts only and nested research envelopes", () => {
    const args = { oldText: "old", newText: "new" }
    expect(normalizeToolResult("edit_file", args, { success: true }).output).toContain("- old\n+ new")
    expect(normalizeToolResult("edit_file", args, { success: false, error: "stale" }).output).toBe("stale")
    expect(normalizeToolResult("exa_search", {}, JSON.stringify({ success: true, data: { results: [{ title: "Docs", url: "https://example.com", text: "source" }] } })).output).toContain("Docs\nhttps://example.com\nsource")
    expect(normalizeToolResult("search_files", {}, { data: { matches: [{ path: "a.ts", line: 2, content: "hello" }] } }).output).toBe("a.ts:2: hello")
  })
  test("six-line preview counts wrapped rows and preserves runtime log references", () => {
    const t = new ToolTranscript()
    const c = t.finish("run_command", {}, { success: true, data: { stdout: Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n"), exitCode: 0, truncated: true, logPath: "/tmp/log" } })
    expect(renderToolBlock(c)).toContain("… +4 lines")
    expect(renderToolBlock(c)).not.toContain("Ctrl+O")
    expect(renderToolBlock(c, { interactive: true })).toContain("Ctrl+O")
    expect(renderToolBlock(c, { expanded: true })).toContain("line9")
    expect(renderToolBlock(c)).toContain("Retained log: /tmp/log")
    for (const line of renderToolBlock(c, { width: 20 }).trimEnd().split("\n")) expect(terminalCells(line)).toBeLessThanOrEqual(20)
  })
  test("deterministic review, edit/test and research sequences retain chronology", () => {
    const t = new ToolTranscript()
    const fixtures: [string, Record<string, unknown>, unknown][] = [
      ["run_command", { command: "git status" }, { data: { stdout: " M a.ts", exitCode: 0 } }],
      ["run_command", { command: "git diff --cached --stat" }, { data: { stdout: "a.ts | 2", exitCode: 0 } }],
      ["run_command", { command: "git diff --cached -- a.ts" }, { data: { stdout: "+new", exitCode: 0 } }],
      ["read_file", { path: "a.ts" }, { data: { content: "old" } }],
      ["edit_file", { path: "a.ts", oldText: "old", newText: "new" }, { success: true }],
      ["run_command", { command: "bun test" }, { data: { stdout: "1 pass", exitCode: 0 } }],
      ["web_search", { query: "docs" }, { data: { results: [] } }],
      ["web_fetch", { url: "https://example.com" }, { data: { content: "docs" } }],
    ]
    const transcript = fixtures.map(([name, args, result], i) => {
      const call = t.start(name, args, String(i), i * 100)
      const start = renderToolBlock(call, { now: i * 100 })
      return start + renderToolBlock(t.finish(name, args, result, String(i), i * 100 + 50), { completionOnly: true })
    }).join("\n")
    expect(t.calls.map((c) => c.category)).toEqual(["SHELL", "SHELL", "SHELL", "READ", "EDIT", "SHELL", "WEB SEARCH", "WEB FETCH"])
    expect(transcript).not.toContain("\x1b")
    expect(transcript.indexOf("git status")).toBeLessThan(transcript.indexOf("git diff --cached --stat"))
    t.start("run_command", { command: "sleep 10" })
    expect(t.settle("cancelled").map((c) => c.status)).toEqual(["cancelled"])
  })
})

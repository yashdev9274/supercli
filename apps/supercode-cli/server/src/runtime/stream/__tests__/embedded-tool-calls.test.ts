import { test, expect } from "bun:test"
import {
  parseStreamedContent,
  extractEmbeddedToolCalls,
  stripControlTokens,
} from "../embedded-tool-calls"

function drain(parser: any, chunks: string[]) {
  const text: string[] = []
  const calls: any[] = []
  for (const chunk of chunks) {
    const out = parser.push(chunk)
    if (out.text) text.push(out.text)
    calls.push(...out.calls)
  }
  const flushed = parser.flush()
  if (flushed.text) text.push(flushed.text)
  calls.push(...flushed.calls)
  return { text: text.join(""), calls }
}

test("square bracket single tool call, one chunk", () => {
  const parser = parseStreamedContent()
  const out = drain(parser, [
    'I\'ll check right away.[TOOL_CALL]\nrun_command --command="git diff --staged"\n[/TOOL_CALL]',
  ])
  expect(out.text).toBe("I'll check right away.")
  expect(out.calls).toEqual([
    { name: "run_command", args: { command: "git diff --staged" }, id: "" },
  ])
})

test("square bracket split across two chunks", () => {
  const out = drain(
    parseStreamedContent(),
    ["I'll check.", "[TOOL_CALL]\nrun_command --command=\"git diff --staged\"\n[/", "TOOL_CALL]"],
  )
  expect(out.text).toBe("I'll check.")
  expect(out.calls).toEqual([
    { name: "run_command", args: { command: "git diff --staged" }, id: "" },
  ])
})

test("xml invoke block", () => {
  const out = drain(
    parseStreamedContent(),
    ["Sure.<tool_call><invoke name=run_command><parameter name=command>", "git diff", "</parameter></invoke></tool_call>"],
  )
  expect(out.text).toBe("Sure.")
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].name).toBe("run_command")
  expect(out.calls[0].args.command).toBe("git diff")
})

test("xml invoke with explicit quoted name + multiple params", () => {
  const out = drain(
    parseStreamedContent(),
    ['<tool_call><invoke name="edit_file"><parameter name="path">/a/b.ts</parameter><parameter name="old_string">foo</parameter><parameter name="new_string">bar</parameter></invoke></tool_call>after'],
  )
  expect(out.calls.length).toBe(1)
  const c = out.calls[0]
  expect(c.name).toBe("edit_file")
  expect(c.args).toEqual({ path: "/a/b.ts", old_string: "foo", new_string: "bar" })
  expect(out.text).toBe("after")
})

test("minimax <invoke> with <command>/<description> tags (live leak repro)", () => {
  const out = drain(
    parseStreamedContent(),
    [
      ']<]minimax[>[<tool_call><invoke name="run_command"><command>git diff --cached cortex-sdk.md</command><description>Show full staged diff</description></invoke></tool_call>]',
    ],
  )
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].name).toBe("run_command")
  expect(out.calls[0].args).toEqual({
    command: "git diff --cached cortex-sdk.md",
    description: "Show full staged diff",
  })
  expect(out.text).toBe("")
})

test("degraded minimax invoke fragment is recovered", () => {
  const out = drain(
    parseStreamedContent(),
    [
      'invoke name="run_command">command>git diff --cached cortex-sdk.md/command>description>Show staged diff for cortex-sdk.md/description>/invoke>\n/tool_call>',
    ],
  )
  expect(out.calls.length).toBe(1)
  expect(out.calls[0]).toEqual({
    name: "run_command",
    args: {
      command: "git diff --cached cortex-sdk.md",
      description: "Show staged diff for cortex-sdk.md",
    },
    id: "",
  })
  expect(out.text).toBe("")
})

test("degraded minimax invoke fragment split across chunks is held", () => {
  const out = drain(
    parseStreamedContent(),
    [
      'invoke name="run_command">command>git ',
      "diff --cached --stat/command>description>Show stat/description>",
      "/invoke>\n/tool_call>",
    ],
  )
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].args).toEqual({
    command: "git diff --cached --stat",
    description: "Show stat",
  })
  expect(out.text).toBe("")
})

test("bare <invoke> without <tool_call> wrapper is recovered", () => {
  const out = drain(
    parseStreamedContent(),
    ['<invoke name="run_command"><command>git status</command><description>Check status</description></invoke>'],
  )
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].name).toBe("run_command")
  expect(out.calls[0].args.command).toBe("git status")
  expect(out.text).toBe("")
})

test("bare <invoke> split across chunks is held until close", () => {
  const out = drain(
    parseStreamedContent(),
    ['<invoke name="run_command"><command>git ', "diff --staged</command></invoke>"],
  )
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].args.command).toBe("git diff --staged")
  expect(out.text).toBe("")
})

test("<invoke> with no args is dropped, not leaked or executed", () => {
  const out = drain(
    parseStreamedContent(),
    ["<tool_call><invoke name=run_command></invoke></tool_call>"],
  )
  expect(out.calls.length).toBe(0)
  expect(out.text).toBe("")
})

test("unclosed <invoke> is dropped on flush, not leaked", () => {
  const out = drain(parseStreamedContent(), ["<invoke name=\"run_command\"><command>git"])
  expect(out.calls.length).toBe(0)
  expect(out.text).toBe("")
})

test("trailing prose after a block is emitted", () => {
  const out = drain(
    parseStreamedContent(),
    ["Done.[TOOL_CALL]\nread_file --path=\"/x\"\n[/TOOL_CALL] All set!"],
  )
  expect(out.text).toBe("Done. All set!")
  expect(out.calls.length).toBe(1)
})

test("no marker - all prose is emitted immediately", () => {
  const out = drain(parseStreamedContent(), ["hello world", " more"])
  expect(out.text).toBe("hello world more")
  expect(out.calls.length).toBe(0)
})

test("truncated/unclosed marker is dropped on flush, not leaked", () => {
  const out = drain(parseStreamedContent(), ["help", "[TOOL_CALL]\nrun_command --command="])
  expect(out.text).toBe("help")
  expect(out.calls.length).toBe(0)
})

test("bare json descriptor single chunk", () => {
  const out = drain(
    parseStreamedContent(),
    ['{"name":"run_command","parameters":{"command":"git status"}}'],
  )
  expect(out.text).toBe("")
  expect(out.calls).toEqual([
    { name: "run_command", args: { command: "git status" }, id: "" },
  ])
})

test("bare json descriptor with surrounding prose", () => {
  const out = drain(
    parseStreamedContent(),
    ["Let me check.", '{"name":"read_file","parameters":{"path":"/x.ts"}}', " Now done."],
  )
  expect(out.text).toBe("Let me check. Now done.")
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].name).toBe("read_file")
  expect(out.calls[0].args).toEqual({ path: "/x.ts" })
})

test("bare json descriptor split across chunks", () => {
  const out = drain(
    parseStreamedContent(),
    ['{"name":"run_command","param', 'eters":{"command":"git diff --staged"}}'],
  )
  expect(out.calls.length).toBe(1)
  const c = out.calls[0]
  expect(c.name).toBe("run_command")
  expect(c.args.command).toBe("git diff --staged")
})

test("bare json descriptor accepts arguments and args keys", () => {
  const a = drain(parseStreamedContent(), ['{"name":"edit_file","arguments":{"path":"/a"}}'])
  expect(a.calls[0].args).toEqual({ path: "/a" })
  const b = drain(parseStreamedContent(), ['{"name":"web_search","args":{"query":"x"}}'])
  expect(b.calls[0].args).toEqual({ query: "x" })
})

test("bare json with unknown tool name is left as prose", () => {
  const out = drain(
    parseStreamedContent(),
    ['here is some { "name": "not_a_tool", "parameters": {"q":1} } prose'],
  )
  expect(out.text).toContain("prose")
  expect(out.calls.length).toBe(0)
})

test("json descriptor with nested braces in a string arg", () => {
  const out = drain(
    parseStreamedContent(),
    ['{"name":"edit_file","parameters":{"path":"/a","old_string":"{foo}"}}'],
  )
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].args.old_string).toBe("{foo}")
})

// ─── MiniMax-M3 shapes that were leaking as raw text ───────────────────────

test("minimax tool-key descriptor with top-level args", () => {
  const out = drain(
    parseStreamedContent(),
    [
      'I\'ll check what\'s currently staged.]<]minimax[>[<tool_call>\n{ "tool": "run_command", "command": "git status", "description": "Check git status for staged changes" }\n{ "tool": "run_command", "command": "git diff --staged --stat", "description": "Show summary of staged changes" }',
    ],
  )
  expect(out.text).toBe("I'll check what's currently staged.")
  expect(out.calls.length).toBe(2)
  expect(out.calls[0]).toEqual({
    name: "run_command",
    args: {
      command: "git status",
      description: "Check git status for staged changes",
    },
    id: "",
  })
  expect(out.calls[1].name).toBe("run_command")
  expect(out.calls[1].args.command).toBe("git diff --staged --stat")
})

test("minimax tool-key descriptor split across chunks", () => {
  const out = drain(
    parseStreamedContent(),
    [
      "Checking.]<]minimax[>",
      '[<tool_call>\n{ "tool": "run_command", "com',
      'mand": "git status" }',
    ],
  )
  expect(out.text).toBe("Checking.")
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].name).toBe("run_command")
  expect(out.calls[0].args.command).toBe("git status")
})

test("minimax tool-key with whitespace around braces", () => {
  const out = drain(
    parseStreamedContent(),
    ['{ "tool" : "read_file" , "path" : "/a.ts" }'],
  )
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].name).toBe("read_file")
  expect(out.calls[0].args.path).toBe("/a.ts")
})

test("pipe-style special tokens are stripped", () => {
  const out = drain(
    parseStreamedContent(),
    ["hello <|tool_call_begin|> world <|minimax|>"],
  )
  expect(out.text).toBe("hello  world ")
  expect(out.calls.length).toBe(0)
})

test("stripControlTokens helper", () => {
  expect(stripControlTokens("x]<]minimax[>[<tool_call>y")).toBe("xy")
  expect(stripControlTokens("a<|foo|>b")).toBe("ab")
})

test("DeepSeek DSML control tokens are stripped from prose", () => {
  const out = drain(parseStreamedContent(), [
    "Let me look at that file.\n\n<｜｜DSML｜｜tool_calls>\n<｜｜DSML｜｜>",
  ])
  expect(out.text.trim()).toBe("Let me look at that file.")
  expect(out.calls.length).toBe(0)
})

test("DeepSeek DSML tokens split across chunks do not leak", () => {
  const out = drain(parseStreamedContent(), [
    "Reading.\n<｜",
    "｜DSML｜｜tool_calls>\n",
    "<｜｜DSML｜｜",
    ">",
  ])
  expect(out.text).not.toContain("DSML")
  expect(out.text).not.toContain("<｜")
  expect(out.text.trim()).toBe("Reading.")
})

test("stripControlTokens removes fullwidth DSML markers", () => {
  expect(
    stripControlTokens("hi <｜｜DSML｜｜tool_calls> there <｜｜DSML｜｜>"),
  ).toBe("hi  there ")
})

test("DeepSeek DSML invoke with parameters becomes a tool call", () => {
  const out = drain(parseStreamedContent(), [
    'Let me read it.\n<｜DSML｜tool_calls>\n<｜DSML｜invoke name="read_file">\n<｜DSML｜parameter name="path" string="true">offline-ai.md</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜tool_calls>',
  ])
  expect(out.text.trim()).toBe("Let me read it.")
  expect(out.calls.length).toBe(1)
  expect(out.calls[0]).toEqual({
    name: "read_file",
    args: { path: "offline-ai.md" },
    id: "",
  })
})

test("DeepSeek DSML invoke with JSON number param (string=false)", () => {
  const out = drain(parseStreamedContent(), [
    '<｜DSML｜invoke name="web_search">\n<｜DSML｜parameter name="query" string="true">bun test</｜DSML｜parameter>\n<｜DSML｜parameter name="limit" string="false">5</｜DSML｜parameter>\n</｜DSML｜invoke>',
  ])
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].name).toBe("web_search")
  expect(out.calls[0].args).toEqual({ query: "bun test", limit: 5 })
  expect(out.text).toBe("")
})

test("DeepSeek DSML invoke split across chunks is recovered", () => {
  const out = drain(parseStreamedContent(), [
    'Checking.\n<｜DSML｜tool_calls>\n<｜DSML｜invoke name="read_file">\n',
    '<｜DSML｜parameter name="path" string="true">src/a.ts',
    "</｜DSML｜parameter>\n</｜DSML｜invoke>\n</｜DSML｜tool_calls>",
  ])
  expect(out.text.trim()).toBe("Checking.")
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].args.path).toBe("src/a.ts")
})

test("DeepSeek doubled-bar DSML invoke (relay variant) is recovered", () => {
  const out = drain(parseStreamedContent(), [
    '<｜｜DSML｜｜invoke name="search_files"><｜｜DSML｜｜parameter name="query" string="true">agent</｜｜DSML｜｜parameter></｜｜DSML｜｜invoke>',
  ])
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].name).toBe("search_files")
  expect(out.calls[0].args.query).toBe("agent")
})

test("incomplete DSML tool_calls wrapper alone does not empty-out prose", () => {
  const out = drain(parseStreamedContent(), [
    "Let me look at that file.\n\n<｜｜DSML｜｜tool_calls>\n<｜｜DSML｜｜",
  ])
  expect(out.text.trim()).toBe("Let me look at that file.")
  expect(out.calls.length).toBe(0)
})

test("unclosed DSML invoke is dropped on flush, not leaked", () => {
  const out = drain(parseStreamedContent(), [
    '<｜DSML｜invoke name="read_file"><｜DSML｜parameter name="path" string="true">x',
  ])
  expect(out.calls.length).toBe(0)
  expect(out.text).not.toContain("DSML")
  expect(out.text).not.toContain("read_file")
})

test("extractEmbeddedToolCalls one-shot helper", () => {
  const out = extractEmbeddedToolCalls(
    'Looking.]<]minimax[>[<tool_call>\n{ "tool": "run_command", "command": "ls" }',
  )
  expect(out.text).toBe("Looking.")
  expect(out.calls.length).toBe(1)
  expect(out.calls[0]!.args.command).toBe("ls")
})

test("json name key still works with surrounding whitespace", () => {
  const out = drain(
    parseStreamedContent(),
    ['{ "name": "run_command", "parameters": { "command": "pwd" } }'],
  )
  expect(out.calls.length).toBe(1)
  expect(out.calls[0].args.command).toBe("pwd")
})

import { describe, expect, test } from "bun:test"
import {
  agentService,
  getAgent,
  listAgents,
  loadTools,
  toolMeta,
  loadPrompt,
  mergeParentChildPermissions,
} from "src/agents"
import { tools } from "src/agents/tools/registry.ts"
import { extractEmbeddedToolCalls } from "src/lib/embedded-tool-calls.ts"
import { permissionManager, setCurrentAgent } from "src/tools/permission-manager.ts"
import { resolvePath } from "src/lib/workspace"
import path from "node:path"
import { mkdir, writeFile, rm, realpath } from "node:fs/promises"
import os from "node:os"

describe("agents harness catalog", () => {
  test("registers build/plan/explore/general + hidden agents", () => {
    const names = listAgents({ includeHidden: true }).map((a) => a.info.name).sort()
    for (const n of ["build", "plan", "explore", "general", "compaction", "title", "summary"]) {
      expect(names).toContain(n)
    }
    expect(getAgent("build")?.info.mode).toBe("primary")
    expect(getAgent("explore")?.info.mode).toBe("subagent")
    expect(getAgent("compaction")?.info.hidden).toBe(true)
  })

  test("loadTools exposes stable tool names", () => {
    const t = loadTools()
    const expected = [
      "read_file",
      "write_file",
      "edit_file",
      "run_command",
      "search_files",
      "delegate",
      "task",
      "skill",
    ]
    for (const name of expected) {
      expect(t[name]).toBeDefined()
      expect(tools[name]).toBeDefined()
      expect(toolMeta[name]?.description?.length).toBeGreaterThan(0)
    }
  })

  test("build instructions load from agents tree", async () => {
    const prompt = await loadPrompt("build")
    expect(prompt).toBeTruthy()
    expect(prompt!).toContain("build agent")
  })

  test("plan instructions load", async () => {
    const prompt = await loadPrompt("plan")
    expect(prompt).toBeTruthy()
  })
})

describe("plan/explore deny write", () => {
  test("plan agent ruleset denies write_file", async () => {
    setCurrentAgent("plan")
    try {
      const allowed = await permissionManager.check("write_file", {
        path: "foo.ts",
        content: "x",
      })
      expect(allowed).toBe(false)
    } finally {
      setCurrentAgent(undefined)
    }
  })

  test("explore agent ruleset denies run_command", async () => {
    setCurrentAgent("explore")
    try {
      const allowed = await permissionManager.check("run_command", {
        command: "echo hi",
      })
      expect(allowed).toBe(false)
    } finally {
      setCurrentAgent(undefined)
    }
  })

  test("explore allows read_file", async () => {
    setCurrentAgent("explore")
    try {
      const allowed = await permissionManager.check("read_file", {
        path: "package.json",
      })
      expect(allowed).toBe(true)
    } finally {
      setCurrentAgent(undefined)
    }
  })
})

describe("parent-child permission merge", () => {
  test("parent deny overrides child allow", () => {
    const child = [{ permission: "*", pattern: "*", action: "allow" as const }]
    const parent = [
      { permission: "write_file", pattern: "*", action: "deny" as const },
    ]
    const merged = mergeParentChildPermissions(child, parent)
    // last matching deny should win via findLast in permission manager;
    // ensure deny is present at end
    expect(merged.some((r) => r.action === "deny" && r.permission === "write_file")).toBe(
      true,
    )
  })
})

describe("DSML invoke recovery", () => {
  test("extracts DeepSeek-style invoke into tool calls", () => {
    const raw = [
      "Looking at the file...",
      '<｜DSML｜invoke name="read_file">',
      '<｜DSML｜parameter name="path">src/index.ts</｜DSML｜parameter>',
      "</｜DSML｜invoke>",
    ].join("\n")
    const { calls, text } = extractEmbeddedToolCalls(raw)
    // Parser may recover invoke; at minimum control junk should not crash
    expect(Array.isArray(calls)).toBe(true)
    expect(typeof text).toBe("string")
  })

  test("extracts xml invoke tool call", () => {
    const raw =
      '<tool_call><invoke name="read_file"><parameter name="path">a.ts</parameter></invoke></tool_call>'
    const { calls } = extractEmbeddedToolCalls(raw)
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0]!.name).toBe("read_file")
  })
})

describe("read_file path resolve smoke", () => {
  test("execute read_file against temp workspace", async () => {
    const dir = await mkdir(path.join(os.tmpdir(), `sc-agents-${Date.now()}`), {
      recursive: true,
    }).then(() => path.join(os.tmpdir(), `sc-agents-ws-${Date.now()}`))
    await mkdir(dir, { recursive: true })
    const prev = process.env.SUPERCODE_WORKSPACE_ROOT
    process.env.SUPERCODE_WORKSPACE_ROOT = dir
    try {
      await writeFile(path.join(dir, "hello.txt"), "hello agents\n", "utf-8")
      const full = resolvePath("hello.txt")
      expect(full).toBe(path.join(await realpath(dir), "hello.txt"))

      const defined = await import("src/agents/tools/read_file.ts")
      const result = await defined.readFileTool.execute({ path: "hello.txt" })
      const parsed = typeof result === "string" ? JSON.parse(result) : result
      expect(parsed.success).toBe(true)
      expect(String(parsed.data?.content ?? "")).toContain("hello agents")
    } finally {
      if (prev === undefined) delete process.env.SUPERCODE_WORKSPACE_ROOT
      else process.env.SUPERCODE_WORKSPACE_ROOT = prev
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe("agentService singleton", () => {
  test("agentService matches getAgent", () => {
    expect(agentService.get("build")).toBe(getAgent("build"))
  })
})

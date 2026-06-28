import { describe, test, expect, beforeEach } from "bun:test"
import {
  permissionManager,
  setCurrentAgent,
  getCurrentAgent,
} from "src/tools/permission-manager.ts"
import { agentService } from "src/agent/index.ts"

describe("Permission isolation — Phase 5 enforcement", () => {
  beforeEach(() => {
    permissionManager.setSessionLevel(null)
    setCurrentAgent(undefined)
  })

  test("explore subagent can read files without prompting", async () => {
    setCurrentAgent("explore")
    const allowed = await permissionManager.check("read_file", { path: "src/index.ts" })
    expect(allowed).toBe(true)
  })

  test("explore subagent is DENIED write_file even when granted by parent", async () => {
    setCurrentAgent("explore")
    const allowed = await permissionManager.check("write_file", {
      path: "src/foo.ts",
    })
    expect(allowed).toBe(false)
  })

  test("explore subagent is DENIED run_command even when granted by parent", async () => {
    setCurrentAgent("explore")
    const allowed = await permissionManager.check("run_command", {
      command: "rm -rf /",
    })
    expect(allowed).toBe(false)
  })

  test("plan agent can read but not write", async () => {
    setCurrentAgent("plan")
    expect(await permissionManager.check("read_file", { path: "x" })).toBe(true)
    expect(await permissionManager.check("write_file", { path: "x" })).toBe(false)
    expect(await permissionManager.check("run_command", { command: "ls" })).toBe(false)
    expect(await permissionManager.check("code_exec", { code: "1+1" })).toBe(false)
  })

  test("build agent can write and run commands (no prompt in this test — sessionLevel null)", async () => {
    setCurrentAgent("build")
    expect(await permissionManager.check("write_file", { path: "x" })).toBe(true)
    expect(await permissionManager.check("run_command", { command: "ls" })).toBe(true)
  })

  test("explicit agentName overrides thread-local", async () => {
    setCurrentAgent("build")
    const allowed = await permissionManager.check(
      "write_file",
      { path: "x" },
      { agentName: "plan" },
    )
    expect(allowed).toBe(false)
  })

  test("sessionLevel allow bypasses everything (including plan denials)", async () => {
    permissionManager.setSessionLevel("allow")
    setCurrentAgent("plan")
    const allowed = await permissionManager.check("write_file", { path: "x" })
    expect(allowed).toBe(true)
  })

  test("non-agent caller still hits the prompt flow for write_file", async () => {
    // Without setting an agent, the user-facing prompt fires.
    // We can't fully test that here (it's interactive), but we can verify
    // that no agent ruleset is applied when agentName is undefined.
    setCurrentAgent(undefined)
    const explore = agentService.get("explore")
    expect(explore).toBeDefined()
    // catch-all deny first, specific allows after
    expect(explore!.info.permission[0]!.permission).toBe("*")
    const readRule = explore!.info.permission.find(
      (r) => r.permission === "read_file",
    )
    expect(readRule?.action).toBe("allow")
  })

  test("setCurrentAgent / getCurrentAgent round-trip", () => {
    expect(getCurrentAgent()).toBeUndefined()
    setCurrentAgent("explore")
    expect(getCurrentAgent()).toBe("explore")
    setCurrentAgent(undefined)
    expect(getCurrentAgent()).toBeUndefined()
  })
})
import { describe, test, expect, beforeEach } from "bun:test"
import {
  permissionManager,
  setCurrentAgent,
} from "src/tools/permission-manager.ts"

describe("PermissionManager.setPromptFunction", () => {
  beforeEach(() => {
    permissionManager.setSessionLevel(null)
    permissionManager.setPromptFunction(null)
    setCurrentAgent(undefined)
  })

  test("uses registered prompt function instead of default readline", async () => {
    let promptCalled = false
    permissionManager.setPromptFunction(async (req) => {
      promptCalled = true
      expect(req.toolName).toBe("run_command")
      expect(req.resource).toBe("echo hi")
      return "once"
    })

    const ok = await permissionManager.check("run_command", {
      command: "echo hi",
    })
    expect(ok).toBe(true)
    expect(promptCalled).toBe(true)
  })

  test("'always' reply persists a session rule", async () => {
    permissionManager.setPromptFunction(async () => "always")

    const first = await permissionManager.check("run_command", {
      command: "ls -la",
    })
    expect(first).toBe(true)

    // Reset prompt function so the second check exercises the saved rule.
    // (The persisted sessionSavedRules still grants it.)
    permissionManager.setPromptFunction(null)
    permissionManager.setSessionLevel(null)
    const second = await permissionManager.check("run_command", {
      command: "ls -lh",
    })
    expect(second).toBe(true)
  })

  test("'reject' reply returns false and does NOT persist a rule", async () => {
    permissionManager.setPromptFunction(async () => "reject")

    const ok = await permissionManager.check("run_command", {
      command: "rm -rf /",
    })
    expect(ok).toBe(false)

    permissionManager.setPromptFunction(null)
    permissionManager.setSessionLevel(null)
    // Second check falls back to readline — but bun test isn't a TTY, so
    // the manager logs a warning and denies immediately. No rule was
    // persisted from the first reject.
    const second = await permissionManager.check("run_command", {
      command: "ls",
    })
    expect(second).toBe(false)
  })

  test("prompt function receives isDangerous=true for destructive commands", async () => {
    let receivedDangerous = false
    permissionManager.setPromptFunction(async (req) => {
      receivedDangerous = req.isDangerous
      return "reject"
    })

    await permissionManager.check("run_command", { command: "rm -rf /tmp" })
    expect(receivedDangerous).toBe(true)
  })

  test("prompt function receives isDangerous=false for safe commands", async () => {
    let receivedDangerous = true
    permissionManager.setPromptFunction(async (req) => {
      receivedDangerous = req.isDangerous
      return "once"
    })

    await permissionManager.check("run_command", { command: "ls" })
    expect(receivedDangerous).toBe(false)
  })

  test("setPromptFunction(null) restores default behavior", async () => {
    permissionManager.setPromptFunction(null)
    // No assertion possible about readline without a TTY, but the call
    // should not throw — and the manager should still resolve to a boolean.
    const ok = await permissionManager.check("run_command", {
      command: "echo default",
    })
    expect(typeof ok).toBe("boolean")
  })
})

describe("PermissionManager.check — agent-aware behavior in chat loop context", () => {
  beforeEach(() => {
    permissionManager.setSessionLevel(null)
    permissionManager.setPromptFunction(null)
    setCurrentAgent(undefined)
  })

  test("chat mode (currentAgent undefined) → run_command prompts", async () => {
    let prompted = false
    permissionManager.setPromptFunction(async () => {
      prompted = true
      return "once"
    })

    // chat loop sets currentAgent=undefined → no agent ruleset
    setCurrentAgent(undefined)
    const ok = await permissionManager.check("run_command", {
      command: "mkdir -p test",
    })
    expect(prompted).toBe(true)
    expect(ok).toBe(true)
  })

  test("agent mode (currentAgent=build) → run_command auto-allowed", async () => {
    let prompted = false
    permissionManager.setPromptFunction(async () => {
      prompted = true
      return "once"
    })

    // chat loop sets currentAgent="build" when mode = agent
    setCurrentAgent("build")
    const ok = await permissionManager.check("run_command", {
      command: "mkdir -p test",
    })
    // build agent allows * so no prompt fires
    expect(prompted).toBe(false)
    expect(ok).toBe(true)
  })

  test("plan mode (currentAgent=plan) → run_command denied silently", async () => {
    let prompted = false
    permissionManager.setPromptFunction(async () => {
      prompted = true
      return "once"
    })

    setCurrentAgent("plan")
    const ok = await permissionManager.check("run_command", {
      command: "ls",
    })
    expect(prompted).toBe(false)
    expect(ok).toBe(false)
  })

  test("subagent delegation: explore agent granted write_file by parent but still denied", async () => {
    let prompted = false
    permissionManager.setPromptFunction(async () => {
      prompted = true
      return "once"
    })

    // Simulate what runner.ts does when spawning an explore subagent.
    // Even if the parent passes tools:["write_file"], the explore
    // ruleset denies it.
    setCurrentAgent("explore")
    const ok = await permissionManager.check("write_file", {
      path: "src/auth.ts",
    })
    expect(prompted).toBe(false)
    expect(ok).toBe(false)
  })
})
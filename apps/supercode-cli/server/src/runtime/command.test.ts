import { afterEach, expect, test } from "bun:test"
import { rm, readFile } from "node:fs/promises"
import { dirname } from "node:path"
import { tmpdir } from "node:os"
import { executeCommand, type CommandOptions } from "./command"

const logs: string[] = []
async function run(command: string, options: Partial<CommandOptions> = {}) {
  const result = await executeCommand({ command, cwd: tmpdir(), timeout: 3000, ...options })
  logs.push(dirname(result.logPath))
  return result
}
afterEach(async () => {
  await Promise.all(logs.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

test("captures both streams, callback and nonzero exit", async () => {
  const chunks: string[] = []
  const result = await run("printf out; printf err >&2; exit 7", { onOutput: (_stream, text) => chunks.push(text) })
  expect(result.success).toBe(false)
  expect(result.exitCode).toBe(7)
  expect(result.stdout).toBe("out")
  expect(result.stderr).toBe("err")
  expect(chunks.join("")).toContain("out")
  expect(await readFile(result.logPath, "utf8")).toContain("[stderr] err")
})

test("stdin is closed rather than automatically approved", async () => {
  const result = await run("if read answer; then printf answered; else printf closed; fi")
  expect(result.success).toBe(true)
  expect(result.stdout).toBe("closed")
})

test("signal and spawn failure are not success", async () => {
  const signalled = await run("kill -TERM $$")
  expect(signalled.success).toBe(false)
  expect(signalled.exitCode).toBeNull()
  expect(signalled.signal).toBe("SIGTERM")
  const missing = await run("printf no", { cwd: "/nonexistent-supercode-test-directory" })
  expect(missing.success).toBe(false)
  expect(missing.exitCode).toBeNull()
})

test("timeouts and cancellation stop owned process groups", async () => {
  const timeout = await run("sleep 20 & wait", { timeout: 50 })
  expect(timeout.timedOut).toBe(true)
  expect(timeout.success).toBe(false)
  expect(timeout.durationMs).toBeLessThan(2500)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 50)
  try {
    const cancelled = await run("sleep 20 & wait", { signal: controller.signal })
    expect(cancelled.cancelled).toBe(true)
    expect(cancelled.success).toBe(false)
    expect(cancelled.durationMs).toBeLessThan(2500)
  } finally { clearTimeout(timer) }
})

test("large output is bounded but retained in the log", async () => {
  const result = await run("awk 'BEGIN { for (i=0; i<50000; i++) printf \"x\" }'")
  expect(result.success).toBe(true)
  expect(result.stdout.length).toBe(32000)
  expect(result.truncated).toBe(true)
  expect((await readFile(result.logPath)).length).toBeGreaterThan(50000)
})

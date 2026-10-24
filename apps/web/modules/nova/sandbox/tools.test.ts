import { afterEach, expect, test } from "bun:test"
import type { Sandbox } from "@vercel/sandbox"

import { checkoutPolicy, executionPolicy, relativePath, sandboxEnabled } from "./policy"
import { createToolExecutor, runBounded, sandboxTools } from "./tools"

const original = { ...process.env }
afterEach(() => {
  for (const key of ["NOVA_SANDBOX_ENABLED", "NOVA_SANDBOX_USER_IDS", "NOVA_SANDBOX_ORGANIZATION_IDS", "NOVA_SANDBOX_REGISTRY_DOMAINS"]) {
    if (original[key] === undefined) delete process.env[key]
    else process.env[key] = original[key]
  }
})

function fixture(chunks = ["ok"], exitCode = 0) {
  let killed = 0
  let started = 0
  const sandbox = {
    async runCommand() {
      started++
      return {
        async *logs() { for (const data of chunks) yield { stream: "stdout", data } },
        async wait() { return { exitCode } },
        async kill() { killed++ },
      }
    },
  } as unknown as Sandbox
  return { sandbox, killed: () => killed, started: () => started }
}

test("rollout is off by default and requires both configured allowlists", () => {
  delete process.env.NOVA_SANDBOX_ENABLED
  expect(sandboxEnabled("u", "o")).toBe(false)
  process.env.NOVA_SANDBOX_ENABLED = "true"
  process.env.NOVA_SANDBOX_USER_IDS = "u"
  process.env.NOVA_SANDBOX_ORGANIZATION_IDS = "o"
  expect(sandboxEnabled("u", "o")).toBe(true)
  expect(sandboxEnabled("x", "o")).toBe(false)
  expect(sandboxEnabled("u", "x")).toBe(false)
})

test("paths reject traversal, metadata, controls and absolute paths", () => {
  for (const path of ["/etc/passwd", "../a", "a/../b", ".git/config", "a\\b", "a\u0000b"]) expect(() => relativePath(path)).toThrow()
  expect(relativePath("src/a.ts")).toBe("src/a.ts")
})

test("checkout credentials are scoped to read-only protocol routes with a deny fallback", () => {
  const policy = checkoutPolicy("owner/repo", "fixture-not-a-secret")
  expect(typeof policy).toBe("object")
  if (typeof policy === "string" || !policy.allow || Array.isArray(policy.allow)) {
    throw new Error("Expected hostname-to-rules policy")
  }
  const rules = policy.allow["github.com"]
  expect(rules).toHaveLength(3)
  expect(JSON.stringify(rules?.[0])).toContain("/owner/repo.git/info/refs")
  expect(JSON.stringify(rules?.[1])).toContain("/owner/repo.git/git-upload-pack")
  expect(rules?.[2]).toEqual({ response: { statusCode: 403 } })
  expect(() => checkoutPolicy("owner/repo/extra", "fixture")).toThrow()
})

test("execution firewall has no checkout credential and rejects wildcard hosts", () => {
  process.env.NOVA_SANDBOX_REGISTRY_DOMAINS = "registry.npmjs.org"
  expect(JSON.stringify(executionPolicy())).not.toContain("Authorization")
  expect(JSON.stringify(executionPolicy())).toContain("403")
  process.env.NOVA_SANDBOX_REGISTRY_DOMAINS = "*.example.com"
  expect(() => executionPolicy()).toThrow()
  process.env.NOVA_SANDBOX_REGISTRY_DOMAINS = ""
  expect(executionPolicy()).toBe("deny-all")
})

test("all eight sandbox tools have serializable input schemas", () => {
  const tools = sandboxTools()
  expect(tools).toHaveLength(8)
  expect(JSON.stringify(tools)).toContain("nova_sandbox_patch")
})

test("bounded output kills the command and never reports truncation as success", async () => {
  const f = fixture(["1234", "5678"])
  const result = await runBounded(f.sandbox, "fixture", [], { maxBytes: 5 })
  expect(result.successful).toBe(false)
  expect(result.truncated).toBe(true)
  expect(result.stdout).toBe("1234")
  expect(f.killed()).toBeGreaterThan(0)
})

test("nonzero commands are failed results", async () => {
  const f = fixture(["failed"], 2)
  expect((await runBounded(f.sandbox, "fixture", [])).successful).toBe(false)
})

test("aborted, disabled, unknown and invalid tool calls never start a command", async () => {
  const f = fixture()
  await expect(runBounded(f.sandbox, "fixture", [], { signal: AbortSignal.abort() })).rejects.toThrow()
  process.env.NOVA_SANDBOX_ENABLED = "false"
  const execute = createToolExecutor(f.sandbox, "a".repeat(40), new AbortController().signal)
  await expect(execute("nova_sandbox_read", { path: "a" })).rejects.toThrow()
  process.env.NOVA_SANDBOX_ENABLED = "true"
  await expect(execute("unknown", {})).rejects.toThrow()
  await expect(execute("nova_sandbox_write", { path: "../a", content: "bad" })).rejects.toThrow()
  expect(f.started()).toBe(0)
})

import { test } from "node:test"
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { setTimeout as delay } from "node:timers/promises"

const root = fileURLToPath(new URL("../", import.meta.url))
const eve = fileURLToPath(new URL("bin/eve.js", import.meta.resolve("eve/package.json")))
const password = "synthetic-workflow-security-test-password"

test("built local service authenticates Workflow deliveries independently of Nova route auth", { timeout: 20_000 }, async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "nova-workflow-security-"))
  const child = spawn(process.execPath, [".output/server/index.mjs"], {
    cwd: root,
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME,
      NODE_ENV: "production", HOST: "127.0.0.1", NITRO_HOST: "127.0.0.1", PORT: "0", NITRO_PORT: "0",
      WORKFLOW_TARGET_WORLD: "local", WORKFLOW_LOCAL_DATA_DIR: dataDir, WORKFLOW_QUEUE_AUTH: "on",
      EVE_SCHEDULES_DISABLED: "1", NOVA_EVE_ENABLED: "true", NOVA_EVE_SERVICE_PASSWORD: password,
    },
    stdio: ["ignore", "pipe", "pipe"],
  })
  const exited = once(child, "exit")
  let timer
  try {
    const origin = await new Promise((resolve, reject) => {
      let output = ""
      timer = setTimeout(() => reject(new Error("Built service did not start")), 10_000)
      child.once("error", reject)
      child.once("exit", () => reject(new Error("Built service exited before listening")))
      child.stderr.resume()
      child.stdout.on("data", (chunk) => {
        output = (output + chunk.toString()).slice(-8192)
        const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output)
        if (match) resolve(match[0])
      })
    })
    clearTimeout(timer)
    const health = await fetch(`${origin}/eve/v1/health`, { signal: AbortSignal.timeout(5000) })
    assert.equal(health.status, 200)
    await health.body?.cancel()
    for (const headers of [
      {},
      { "x-workflow-auth": "synthetic-forged-queue-key" },
      { Authorization: `Basic ${Buffer.from(`nova-runtime:${password}`).toString("base64")}` },
    ]) {
      const response = await fetch(`${origin}/.well-known/workflow/v1/flow`, {
        method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: "{}", signal: AbortSignal.timeout(5000),
      })
      assert.equal(response.status, 401)
      assert.equal(response.headers.get("x-workflow-auth-refused"), "1")
      await response.body?.cancel()
    }
    const session = await fetch(`${origin}/eve/v1/session`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: AbortSignal.timeout(5000),
    })
    assert.equal(session.status, 401)
    await session.body?.cancel()
  } finally {
    clearTimeout(timer)
    child.kill("SIGTERM")
    await Promise.race([exited, delay(2000)])
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    await exited
    await rm(dataDir, { recursive: true, force: true })
  }
})

test("documented start command refuses disabling local queue authentication", { timeout: 10_000 }, () => {
  const result = spawnSync(process.execPath, [eve, "start", "--host", "127.0.0.1", "--port", "0"], {
    cwd: root, encoding: "utf8", timeout: 5000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, WORKFLOW_TARGET_WORLD: "local", WORKFLOW_QUEUE_AUTH: "off" },
  })
  assert.notEqual(result.status, 0)
  assert.equal(result.signal, null)
  assert.match(result.stdout + result.stderr, /refuses WORKFLOW_QUEUE_AUTH=off/)
})

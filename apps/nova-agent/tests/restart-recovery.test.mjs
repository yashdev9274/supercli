import { test } from "node:test"
import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { mkdtemp, rm, readdir, access } from "node:fs/promises"
import { setTimeout as delay } from "node:timers/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { createHash, createHmac } from "node:crypto"
import { Client } from "eve/client"
import { createServer } from "node:net"

const root = fileURLToPath(new URL("./fixtures/codex/", import.meta.url))
const secret = "synthetic-eve-codex-scope-key-never-for-production"
function authorization() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url")
  const now = Math.floor(Date.now() / 1000)
  const connectionId = createHash("sha256").update(JSON.stringify(["member_one", "codex", "2026-11-21T00:00:00.000Z"])).digest("base64url")
  const body = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ organizationId: "org_one", userId: "user_one", membershipId: "member_one", novaSessionId: "session_one", provider: "codex", connectionId, model: "fixture-model", effort: "medium", iss: "nova", aud: "nova-eve", iat: now, exp: now + 300 })}`
  return `Bearer ${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`
}

async function start(dataDir, holdInference = false) {
  const listener = createServer()
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve))
  const port = listener.address().port
  await new Promise((resolve) => listener.close(resolve))
  const child = spawn(process.execPath, [".output/server/index.mjs"], {
    cwd: root, stdio: ["ignore", "pipe", "pipe"],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "production", EVE_DEV: "1", EVE_DEV_STATE_DIR: dataDir, ...(holdInference ? { NOVA_TEST_RECOVERY_DIR: dataDir } : {}), HOST: "127.0.0.1", NITRO_HOST: "127.0.0.1", PORT: String(port), NITRO_PORT: String(port), WORKFLOW_LOCAL_BASE_URL: `http://127.0.0.1:${port}`, WORKFLOW_TARGET_WORLD: "local", WORKFLOW_LOCAL_RECOVER_ACTIVE_RUNS: "true", WORKFLOW_QUEUE_AUTH: "on", EVE_SCHEDULES_DISABLED: "1" },
  })
  const exited = once(child, "exit")
  const stop = async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL")
    await exited
  }
  let timer
  try {
    const origin = await new Promise((resolve, reject) => {
      let output = ""
      timer = setTimeout(() => reject(new Error("Fixture startup timed out")), 10_000)
      child.once("error", reject)
      child.once("exit", () => reject(new Error("Fixture exited before listening")))
      child.stderr.resume()
      child.stdout.on("data", (data) => {
        output = (output + data).slice(-8192)
        const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output)
        if (match) resolve(match[0])
      })
    })
    return { origin, stop }
  } catch (error) { await stop(); throw error }
  finally { clearTimeout(timer) }
}

test("a killed Eve process retains completed events and idempotent admission across a fresh process", { timeout: 60_000 }, async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "nova-eve-restart-"))
  let server
  const operationId = `restart:${crypto.randomUUID()}`
  const create = async (origin) => {
    const response = await fetch(`${origin}/eve/v1/session`, { method: "POST", headers: { authorization: authorization(), "Content-Type": "application/json" }, body: JSON.stringify({ message: "Verify capabilities", operationId }), signal: AbortSignal.timeout(10_000) })
    assert.ok(response.ok)
    const id = response.headers.get("x-eve-session-id")
    await response.body?.cancel()
    assert.ok(id)
    return id
  }
  try {
    server = await start(dataDir)
    const id = await create(server.origin)
    const client = new Client({ baseUrl: server.origin, headers: { authorization: authorization() } })
    const handle = client.sessions.attach(id)
    let completed = false
    for await (const event of handle.stream({ signal: AbortSignal.timeout(20_000) })) {
      if (event.type === "turn.settled") { assert.equal(event.data.outcome, "completed"); completed = true; break }
    }
    assert.ok(completed)
    const before = await handle.snapshot()
    assert.ok((await readdir(join(dataDir, ".workflow-data"))).length > 0)
    await server.stop()
    server = await start(dataDir)
    assert.equal(await create(server.origin), id)
    const fresh = new Client({ baseUrl: server.origin, headers: { authorization: authorization() } }).sessions.attach(id)
    const after = await fresh.snapshot({ signal: AbortSignal.timeout(10_000) })
    const facts = (snapshot) => snapshot.events.filter((event) => ["delivery.admitted", "call.settled", "turn.settled", "content.completed"].includes(event.type)).map(({ type, data, meta }) => ({ type, data, position: meta.position }))
    assert.deepEqual(facts(after), facts(before))
    assert.equal(after.events.filter((event) => event.type === "call.settled").length, 1)
    assert.equal(after.events.filter((event) => event.type === "delivery.admitted").length, 1)
  } finally {
    await server?.stop()
    await rm(dataDir, { recursive: true, force: true })
  }
})

test("killing a process during inference recovers the same admission without duplicating its tool", { timeout: 60_000 }, async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "nova-eve-inflight-"))
  let server
  try {
    server = await start(dataDir, true)
    const operationId = `inflight:${crypto.randomUUID()}`
    const submit = async () => {
      const response = await fetch(`${server.origin}/eve/v1/session`, { method: "POST", headers: { authorization: authorization(), "Content-Type": "application/json" }, body: JSON.stringify({ message: "Verify capabilities", operationId }), signal: AbortSignal.timeout(10_000) })
      assert.ok(response.ok)
      const id = response.headers.get("x-eve-session-id")
      await response.body?.cancel()
      return id
    }
    const id = await submit()
    let held = false
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await access(join(dataDir, "inference-held")); held = true; break } catch { await delay(100) }
    }
    assert.ok(held, "must kill during inference, not before execution begins")
    await server.stop()
    server = await start(dataDir, true)
    assert.equal(await submit(), id)
    const handle = new Client({ baseUrl: server.origin, headers: { authorization: authorization() } }).sessions.attach(id)
    let completed = false
    for await (const event of handle.stream({ signal: AbortSignal.timeout(30_000) })) {
      if (event.type === "turn.settled") { assert.equal(event.data.outcome, "completed"); completed = true; break }
    }
    assert.ok(completed)
    const snapshot = await handle.snapshot()
    assert.equal(snapshot.events.filter((event) => event.type === "call.settled").length, 1)
    assert.equal(snapshot.events.filter((event) => event.type === "delivery.admitted").length, 1)
  } finally { await server?.stop(); await rm(dataDir, { recursive: true, force: true }) }
})

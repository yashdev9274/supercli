import { describe, expect, test } from "bun:test"
import { createHash, randomBytes } from "node:crypto"

import { CODEX_CLIENT_ID, createCodexProvider, type CodexProvider, type CodexTokens } from "./provider"
import { assertCodexOrigin, parseCodexAction } from "./request"
import { createCodexService, type CodexRow, type CodexStore } from "./service"
import { createCodexVault } from "./vault"
import { codexPublicError } from "./errors"

const tokens: CodexTokens = { access_token: "test-access", refresh_token: "test-refresh", id_token: "test-id" }
function fixture() {
  let time = 1_000_000
  let polls = 0
  let starts = 0
  let row: CodexRow = {
    membershipId: "membership", state: "disconnected", version: 0, attemptId: null,
    sessionHash: null, encryptedAttempt: null, encryptedCredentials: null, intervalSeconds: 5,
    expiresAt: null, nextPollAt: null, lastStartedAt: null, connectedAt: null,
  }
  const store: CodexStore = {
    get: async () => ({ ...row }),
    compareAndSwap: async (version, patch) => {
      if (row.version !== version) return false
      row = { ...row, ...patch, version: version + 1 }
      return true
    },
  }
  const provider: CodexProvider = {
    start: async () => { starts++; return { device_auth_id: "test-device-secret", user_code: "TEST-CODE", interval: 7 } },
    poll: async () => { polls++; return { pending: false, tokens } },
  }
  const vault = createCodexVault({ v1: randomBytes(32).toString("base64") }, "v1")
  const owner = { userId: "user", organizationId: "org", membershipId: "membership", sessionId: "session" }
  const options = { owner, store, provider, vault: () => vault, now: () => time }
  return {
    service: createCodexService(options), options, provider, vault, store,
    row: () => row, advance: (ms: number) => { time += ms }, polls: () => polls, starts: () => starts,
  }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe("Codex deployment errors", () => {
  test("reports missing migrations and connectivity without leaking raw errors", () => {
    expect(codexPublicError({ code: "P2021", message: "private database details" }).message).toContain("database migration")
    expect(codexPublicError({ code: "P2022" }).statusCode).toBe(503)
    expect(codexPublicError({ code: "P1001" }).message).toContain("could not reach")
    expect(codexPublicError(new Error("private credential")).message).not.toContain("private credential")
  })
})

describe("Codex durable device authorization", () => {
  test("encrypts secrets and redacts browser DTOs; interval gates exchange and replay", async () => {
    const f = fixture()
    const pending = await f.service.start()
    expect(pending.userCode).toBe("TEST-CODE")
    expect(JSON.stringify(pending)).not.toContain("test-device-secret")
    expect(f.row().encryptedAttempt).not.toContain("TEST-CODE")
    expect((await f.service.poll(pending.attemptId!)).state).toBe("pending")
    expect(f.polls()).toBe(0)
    f.advance(7000)
    const connected = await f.service.poll(pending.attemptId!)
    expect(connected.state).toBe("connected")
    expect(f.polls()).toBe(1)
    expect(JSON.stringify(connected)).not.toContain("test-access")
    expect(f.row().encryptedAttempt).toBeNull()
    expect(f.row().encryptedCredentials).not.toContain("test-refresh")
    await expect(f.service.poll(pending.attemptId!)).rejects.toThrow("not found")
    expect(f.polls()).toBe(1)
    await f.service.disconnect()
    expect(f.row().encryptedCredentials).toBeNull()
  })
  test("binds attempt details and polling to browser session and membership", async () => {
    const f = fixture()
    const pending = await f.service.start()
    const other = createCodexService({ ...f.options, owner: { ...f.options.owner, sessionId: "different" } })
    expect(await other.status()).toEqual({ state: "pending" })
    await expect(other.poll(pending.attemptId!)).rejects.toThrow("not found")
    await expect(other.cancel(pending.attemptId!)).rejects.toThrow("not found")
    const foreign = createCodexService({ ...f.options, owner: { ...f.options.owner, membershipId: "foreign" } })
    await expect(foreign.status()).rejects.toThrow("not found")
  })
  test("concurrent starts issue one code; durable throttle survives disconnect", async () => {
    const f = fixture()
    const outcomes = await Promise.allSettled([f.service.start(), f.service.start()])
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    expect(f.starts()).toBe(1)
    await f.service.disconnect()
    await expect(f.service.start()).rejects.toThrow("one minute")
    f.advance(60_000)
    expect((await f.service.start()).state).toBe("pending")
  })
  test("concurrent polls have one consumer", async () => {
    const f = fixture()
    const pending = await f.service.start()
    const gate = deferred<{ pending: false; tokens: CodexTokens }>()
    let calls = 0
    f.provider.poll = async () => { calls++; return gate.promise }
    f.advance(7000)
    const first = f.service.poll(pending.attemptId!)
    await Bun.sleep(1)
    expect((await f.service.poll(pending.attemptId!)).state).toBe("polling")
    gate.resolve({ pending: false, tokens })
    expect((await first).state).toBe("connected")
    expect(calls).toBe(1)
  })
  for (const action of ["cancel", "disconnect"] as const) {
    test(`${action} wins against a late successful exchange`, async () => {
      const f = fixture()
      const pending = await f.service.start()
      const gate = deferred<{ pending: false; tokens: CodexTokens }>()
      f.provider.poll = async () => gate.promise
      f.advance(7000)
      const poll = f.service.poll(pending.attemptId!)
      await Bun.sleep(1)
      if (action === "cancel") await f.service.cancel(pending.attemptId!)
      else await f.service.disconnect()
      gate.resolve({ pending: false, tokens })
      expect((await poll).state).toBe(action === "cancel" ? "cancelled" : "disconnected")
      expect(f.row().encryptedCredentials).toBeNull()
    })
  }
  test("cancels while code issuance is in flight", async () => {
    const f = fixture()
    const gate = deferred<{ device_auth_id: string; user_code: string; interval: number }>()
    f.provider.start = async () => gate.promise
    const start = f.service.start()
    await Bun.sleep(1)
    await f.service.disconnect()
    gate.resolve({ device_auth_id: "test-device", user_code: "CODE", interval: 5 })
    await expect(start).rejects.toThrow("cancelled")
    expect(f.row().encryptedAttempt).toBeNull()
  })
  test("expiry deletes attempt secrets without calling upstream", async () => {
    const f = fixture()
    const pending = await f.service.start()
    f.advance(900_000)
    expect((await f.service.status()).state).toBe("expired")
    expect(f.row().encryptedAttempt).toBeNull()
    await expect(f.service.poll(pending.attemptId!)).rejects.toThrow("not found")
    expect(f.polls()).toBe(0)
  })
  test("stale in-flight consumer fails closed rather than exchanging twice", async () => {
    const f = fixture()
    const pending = await f.service.start()
    f.advance(7000)
    const row = f.row()
    await f.store.compareAndSwap(row.version, { state: "polling", nextPollAt: new Date(1_000_001) })
    expect((await f.service.status()).state).toBe("failed")
    await expect(f.service.poll(pending.attemptId!)).rejects.toThrow("not found")
    expect(f.polls()).toBe(0)
  })
  test("pending polls retain provider interval and honor backoff", async () => {
    const f = fixture()
    f.provider.poll = async () => ({ pending: true, retryAfter: 30 })
    const pending = await f.service.start()
    f.advance(7000)
    expect((await f.service.poll(pending.attemptId!)).retryAfterSeconds).toBe(30)
  })
  test("uncertain exchange failure clears secrets and requires fresh login", async () => {
    const f = fixture()
    f.provider.poll = async () => { throw new Error("exchange failed") }
    const pending = await f.service.start()
    f.advance(7000)
    await expect(f.service.poll(pending.attemptId!)).rejects.toThrow("exchange failed")
    expect((await f.service.status()).state).toBe("failed")
    expect(f.row().encryptedAttempt).toBeNull()
  })
  test("missing encryption configuration never issues a device code", async () => {
    const f = fixture()
    const service = createCodexService({ ...f.options, vault: () => createCodexVault({}, "v1") })
    await expect(service.start()).rejects.toThrow("not configured")
    expect(f.starts()).toBe(0)
  })
})

describe("credential vault", () => {
  test("fresh nonces, authenticated record binding, tamper rejection and key rotation", () => {
    const keys = { v1: randomBytes(32).toString("base64"), v2: randomBytes(32).toString("base64") }
    const old = createCodexVault(keys, "v1")
    const next = createCodexVault(keys, "v2")
    const encrypted = old.seal(tokens, "owner-record")
    expect(encrypted).not.toBe(old.seal(tokens, "owner-record"))
    expect(next.open(encrypted, "owner-record")).toEqual(tokens)
    expect(() => old.open(encrypted, "different-owner")).toThrow("could not be decrypted")
    expect(() => old.open(encrypted.slice(0, -5) + "aaaaa", "owner-record")).toThrow()
    expect(() => createCodexVault({ v1: "short" }, "v1")).toThrow()
  })
})

describe("Codex provider protocol", () => {
  function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
    return handler as unknown as typeof fetch
  }
  test("accepts upstream code alias/string interval and sends fixed client ID", async () => {
    const provider = createCodexProvider(mockFetch((url, init) => {
      expect(url).toBe("https://auth.openai.com/api/accounts/deviceauth/usercode")
      expect(JSON.parse(init!.body as string)).toEqual({ client_id: CODEX_CLIENT_ID })
      expect(init?.redirect).toBe("error")
      return Response.json({ device_auth_id: "secret", usercode: "CODE", interval: "7" })
    }))
    expect(await provider.start()).toEqual({ device_auth_id: "secret", user_code: "CODE", interval: 7 })
  })
  test("403 and 404 mean pending; throttling backs off", async () => {
    for (const status of [403, 404, 429]) {
      const provider = createCodexProvider(mockFetch(() => new Response("private provider body", { status, headers: { "Retry-After": "60" } })))
      const result = await provider.poll({ device_auth_id: "test", user_code: "CODE" })
      expect(result.pending).toBe(true)
      if (status === 429 && result.pending) expect(result.retryAfter).toBe(60)
    }
  })
  test("exchanges PKCE exactly once with the device callback; strips unknown token fields", async () => {
    const verifier = "a".repeat(43)
    let calls = 0
    const provider = createCodexProvider(mockFetch((url, init) => {
      calls++
      if (calls === 1) return Response.json({ authorization_code: "test-code", code_verifier: verifier, code_challenge: createHash("sha256").update(verifier).digest("base64url") })
      expect(url).toBe("https://auth.openai.com/oauth/token")
      const form = new URLSearchParams(init!.body as string)
      expect(form.get("redirect_uri")).toBe("https://auth.openai.com/deviceauth/callback")
      expect(form.get("code_verifier")).toBe(verifier)
      expect(form.get("client_id")).toBe(CODEX_CLIENT_ID)
      return Response.json({ ...tokens, unwanted: "not-retained" })
    }))
    expect(await provider.poll({ device_auth_id: "test", user_code: "CODE" })).toEqual({ pending: false, tokens })
    expect(calls).toBe(2)
  })
  test("mismatched challenge is rejected before token exchange", async () => {
    let calls = 0
    const provider = createCodexProvider(mockFetch(() => {
      calls++
      return Response.json({ authorization_code: "test-code", code_verifier: "a".repeat(43), code_challenge: "b".repeat(43) })
    }))
    await expect(provider.poll({ device_auth_id: "test", user_code: "CODE" })).rejects.toThrow("Invalid authorization")
    expect(calls).toBe(1)
  })
  test("does not retry or expose upstream exchange errors", async () => {
    const verifier = "a".repeat(43)
    let calls = 0
    const provider = createCodexProvider(mockFetch(() => {
      calls++
      return calls === 1 ? Response.json({ authorization_code: "secret-code", code_verifier: verifier, code_challenge: createHash("sha256").update(verifier).digest("base64url") }) : new Response("secret-code secret-token", { status: 400 })
    }))
    await expect(provider.poll({ device_auth_id: "test", user_code: "CODE" })).rejects.toThrow("Codex token exchange failed. Start a new connection.")
    expect(calls).toBe(2)
  })
  test("rejects malformed, oversized, and invalid interval responses", async () => {
    for (const body of [{ device_auth_id: "test", user_code: "CODE", interval: "-1" }, { device_auth_id: "x".repeat(140_000), user_code: "CODE" }, { interval: 5 }]) {
      await expect(createCodexProvider(mockFetch(() => Response.json(body))).start()).rejects.toThrow("Invalid response")
    }
  })
  test("sanitizes network errors", async () => {
    const provider = createCodexProvider(mockFetch(() => { throw new Error("sensitive upstream content") }))
    await expect(provider.start()).rejects.toThrow("Could not contact Codex. Cancel and start a new connection.")
  })
})

describe("request guards", () => {
  test("accepts browser-facing Nova Host when Next normalizes the internal URL", () => {
    const request = (origin: string, extra: Record<string, string> = {}) => new Request("http://localhost:3003/api/nova/codex/connection", {
      method: "POST",
      headers: { host: "nova.localhost:3003", origin, "content-type": "application/json", "sec-fetch-site": "same-origin", ...extra },
    })
    expect(() => assertCodexOrigin(request("http://nova.localhost:3003"))).not.toThrow()
    expect(() => assertCodexOrigin(request("http://nova.localhost:3000"))).toThrow("Same-origin")
    expect(() => assertCodexOrigin(request("https://evil.example", { "x-forwarded-host": "evil.example" }))).toThrow("Same-origin")
    expect(() => assertCodexOrigin(request("http://nova.localhost:3003", { "sec-fetch-site": "cross-site" }))).toThrow("Same-origin")
  })
  test("requires exact origin and rejects cross-site and non-JSON requests", () => {
    const request = (headers: Record<string, string>) => new Request("https://nova.example/api/nova/codex/connection", { method: "POST", headers })
    expect(() => assertCodexOrigin(request({ origin: "https://nova.example", "content-type": "application/json" }))).not.toThrow()
    for (const origin of ["https://evil.example", "null", "https://nova.example.evil", ""]) {
      expect(() => assertCodexOrigin(request({ origin, "content-type": "application/json" }))).toThrow("Same-origin")
    }
    expect(() => assertCodexOrigin(request({ origin: "https://nova.example", "content-type": "application/json", "sec-fetch-site": "cross-site" }))).toThrow()
    expect(() => assertCodexOrigin(request({ origin: "https://nova.example", "content-type": "text/plain" }))).toThrow("JSON")
  })
  test("validates action shape and bounds request size", async () => {
    const request = (body: unknown) => new Request("https://nova.example", { method: "POST", body: JSON.stringify(body) })
    expect(await parseCodexAction(request({ action: "start" }))).toEqual({ action: "start" })
    for (const body of [{ action: "poll", attemptId: "bad" }, { action: "start", membershipId: "foreign" }, { action: "unknown" }, { action: "start", padding: "x".repeat(2000) }]) {
      await expect(parseCodexAction(request(body))).rejects.toThrow()
    }
  })
})

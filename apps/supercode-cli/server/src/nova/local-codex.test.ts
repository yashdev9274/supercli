import { describe, expect, test } from "bun:test"
import type { CodexRpc, NativeMessage } from "./codex-rpc"
import { codexLaunchArgs } from "./codex-rpc"
import { resolveCodexProfile } from "./profile"
import { LocalCodexRuntime, type LocalEvent } from "./runtime"
import { localOrigin, startCompanion } from "./server"

class FakeCodex implements CodexRpc {
  calls: Array<{ method: string; params: unknown }> = []
  listeners = new Set<(message: NativeMessage) => void>()
  account: unknown = { type: "chatgpt", email: "fixture@example.test", planType: "plus" }
  closed = false
  async request(method: string, params: unknown): Promise<unknown> {
    this.calls.push({ method, params })
    if (method === "account/read") return { account: this.account, accessToken: "never-expose" }
    if (method === "model/list") return { data: [{ model: "fixture", displayName: "Fixture" }, { model: "hidden", displayName: "Hidden", hidden: true }], nextCursor: null }
    if (method === "thread/start") return { thread: { id: "native-private-thread" } }
    if (method === "turn/start") {
      queueMicrotask(() => {
        this.notify({ method: "item/agentMessage/delta", params: { threadId: "native-private-thread", delta: "Hello" } })
        this.notify({ method: "turn/completed", params: { threadId: "native-private-thread", turn: { id: "turn-1", status: "completed" } } })
      })
      return { turn: { id: "turn-1" } }
    }
    if (method === "account/login/start") return { loginId: "login-1", authUrl: "https://auth.openai.com/authorize?state=fixture" }
    return {}
  }
  notify(message: NativeMessage) { for (const listener of this.listeners) listener(message) }
  subscribe(listener: (message: NativeMessage) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  close() { this.closed = true; this.notify({ method: "nova/processExited" }) }
}

 describe("existing Codex login", () => {
  test("resolves default, custom, tilde and isolated homes without filesystem access", () => {
    expect(resolveCodexProfile("existing", "", "/fixture")).toEqual({ mode: "existing", path: "/fixture/.codex" })
    expect(resolveCodexProfile("existing", "/work/codex", "/fixture").path).toBe("/work/codex")
    expect(resolveCodexProfile("existing", "~/personal", "/fixture").path).toBe("/fixture/personal")
    expect(resolveCodexProfile("isolated", "/work/codex", "/fixture").path).toBe("/fixture/.nova-codex")
    expect(() => resolveCodexProfile("invalid")).toThrow()
    expect(codexLaunchArgs("existing").join(" ")).not.toContain("cli_auth_credentials_store")
    expect(codexLaunchArgs("isolated").join(" ")).toContain('cli_auth_credentials_store="file"')
  })

  test("reuses account/model RPC and denies changes to shared CLI authentication", async () => {
    const rpc = new FakeCodex()
    const runtime = new LocalCodexRuntime(rpc, "/fixture", "fixture")
    const status = await runtime.status()
    expect(status.profile).toBe("existing")
    expect(status.account?.planType).toBe("plus")
    expect(JSON.stringify(status)).not.toContain("never-expose")
    expect(await runtime.models()).toEqual([{ id: "fixture", label: "Fixture" }])
    await expect(runtime.login()).rejects.toThrow("shared Codex")
    await expect(runtime.logout()).rejects.toThrow("shared Codex")
    await runtime.cancelLogin()
    runtime.unpair("owner")
    expect(rpc.calls.every(({ method }) => !method.includes("login") && method !== "account/logout")).toBe(true)
    runtime.close()
  })

  test("unauthenticated accounts return no models and API-key accounts fail closed", async () => {
    const rpc = new FakeCodex()
    const runtime = new LocalCodexRuntime(rpc, "/fixture", "fixture")
    rpc.account = null
    expect((await runtime.status()).account).toBeNull()
    expect(await runtime.models()).toEqual([])
    rpc.account = { type: "apiKey" }
    await expect(runtime.status()).rejects.toThrow("ChatGPT account")
    runtime.close()
  })

  test("isolated mode retains native login/cancel/logout", async () => {
    const rpc = new FakeCodex()
    const runtime = new LocalCodexRuntime(rpc, "/fixture", "fixture", "isolated")
    await runtime.login()
    expect((await runtime.status()).login).toBe("pending")
    await runtime.cancelLogin()
    await runtime.logout()
    expect(rpc.calls.map(({ method }) => method)).toContain("account/logout")
    runtime.close()
  })

  test("read-only turns expose opaque owned handles and invalidate them on account updates", async () => {
    const rpc = new FakeCodex()
    const runtime = new LocalCodexRuntime(rpc, "/fixture", "fixture")
    const events: LocalEvent[] = []
    const input = { content: "Hello", model: "fixture" }
    await runtime.turn(input, "owner", new AbortController().signal, (event) => events.push(event))
    expect(events.map((event) => event.type)).toEqual(["thread", "text", "finish"])
    expect(events.at(-1)).toEqual({ type: "finish", reason: "completed" })
    expect(JSON.stringify(events)).not.toContain("native-private-thread")
    const thread = events.find((event) => event.type === "thread")
    if (thread?.type !== "thread") throw new Error("Missing thread")
    await expect(runtime.turn({ ...input, thread: thread.id }, "other", new AbortController().signal, () => {})).rejects.toThrow("Thread unavailable")
    rpc.notify({ method: "account/updated" })
    await expect(runtime.turn({ ...input, thread: thread.id }, "owner", new AbortController().signal, () => {})).rejects.toThrow("Thread unavailable")
    const start = rpc.calls.find(({ method }) => method === "turn/start")
    expect(start?.params).toMatchObject({ sandboxPolicy: { type: "readOnly" }, approvalPolicy: "on-request" })
    runtime.close()
  })

  test("loopback pairing protects shared login and unpair revokes access without logout", async () => {
    const rpc = new FakeCodex()
    const runtime = new LocalCodexRuntime(rpc, "/fixture", "fixture")
    const origin = "http://localhost:3003"
    const companion = await startCompanion({ origin, port: 0, runtime })
    const endpoint = `http://127.0.0.1:${companion.port}`
    let token = ""
    const request = (path: string, value = {}, caller = origin) => fetch(`${endpoint}${path}`, {
      method: "POST", headers: { Origin: caller, "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(value),
    })
    try {
      expect((await request("/status")).status).toBe(401)
      expect((await request("/pair", { code: companion.pairingCode, confirm: true }, "https://attacker.test")).status).toBe(403)
      const pairing = await request("/pair", { code: companion.pairingCode, confirm: true })
      token = (await pairing.json() as { token: string }).token
      expect((await request("/status")).status).toBe(200)
      expect((await request("/login")).status).toBe(400)
      expect((await request("/logout")).status).toBe(400)
      expect((await request("/unpair")).status).toBe(200)
      expect((await request("/status")).status).toBe(401)
      expect(rpc.calls.some(({ method }) => method === "account/logout")).toBe(false)
    } finally { await companion.close() }
    expect(() => localOrigin("https://nova.example")).toThrow()
  })
})

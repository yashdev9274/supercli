import { describe, expect, test } from "bun:test"

import { createEveClient, eveOrigin } from "./eve-client"

const origin = "https://nova.example"
const path = "/api/desktop/nova/sessions/session-1/eve/run-1/events"
const admission = { runtime: "eve", runId: "run-1", userMessage: {}, latestSequence: 1, eventsPath: path }
const input = { content: "hello", clientMessageId: "message-1", provider: "anthropic", model: "chosen-model" }
const json = (value: unknown, status = 200) => Response.json(value, { status })

function fixture(responses: Array<Response | Error>, overrides: { delay?: (ms: number, signal?: AbortSignal) => Promise<void>; now?: () => number } = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const delays: number[] = []
  const client = createEveClient({
    origin, token: "terminal-user-token",
    fetch: (async (url, init) => {
      calls.push({ url: String(url), init })
      const next = responses.shift()
      if (next instanceof Error) throw next
      if (!next) throw new Error("No fixture response")
      return next
    }) as typeof fetch,
    delay: overrides.delay ?? (async ms => { delays.push(ms) }),
    now: overrides.now,
  })
  return { client, calls, delays }
}

async function collect(source: AsyncIterable<unknown>) {
  const events: unknown[] = []
  for await (const event of source) events.push(event)
  return events
}

describe("Nova Eve opt-in client", () => {
  test("accepts only explicit secure or exact loopback origins", () => {
    for (const value of ["https://nova.example", "http://localhost:3003", "http://127.0.0.1:3003", "http://[::1]:3003"]) expect(eveOrigin(value)).toBe(value)
    for (const value of ["http://nova.example", "http://127.0.0.2", "http://127.1", "http://localhost.evil", "https://user:pass@nova.example", "https://nova.example/path", "https://nova.example/?key=secret", "https://nova.example/#secret", "https://nova.example/?", "https://nova.example/#", "file:///etc/passwd"]) expect(() => eveOrigin(value)).toThrow()
  })

  test("admits only Eve with exact user selection and terminal bearer", async () => {
    const { client, calls } = fixture([json(admission, 202)])
    expect(await client.admit("session-1", { ...input, effort: "high" })).toEqual(admission)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(`${origin}/api/desktop/nova/sessions/session-1/eve`)
    expect(calls[0]?.init?.redirect).toBe("error")
    expect(calls[0]?.init?.headers).toEqual({ Authorization: "Bearer terminal-user-token", Accept: "application/json", "Content-Type": "application/json" })
    expect(JSON.parse(calls[0]?.init?.body as string)).toEqual({ ...input, effort: "high", mode: "chat" })
  })

  test("does not replace an unsupported selection or retry admission", async () => {
    const { client, calls } = fixture([json({ error: "secret" }, 403)])
    await expect(client.admit("session-1", input)).rejects.toThrow("access denied")
    expect(calls).toHaveLength(1)
    const network = fixture([new TypeError("secret provider credential")])
    await expect(network.client.admit("session-1", input)).rejects.toThrow("Nova network request failed")
    expect(network.calls).toHaveLength(1)
    await expect(fixture([json({ ...admission, runtime: "legacy" }, 202)]).client.admit("session-1", input)).rejects.toThrow("Invalid Nova Eve admission")
  })

  test("rejects untrusted event URLs before forwarding any credential", async () => {
    for (const eventsPath of ["https://evil.example" + path, "https://user:pass@nova.example" + path, path + "?token=secret", path + "#secret", path.replace("run-1", "other-run"), path + "?after=a&after=b"]) {
      const { client, calls } = fixture([json({ ...admission, eventsPath }, 202)])
      await expect(client.admit("session-1", input)).rejects.toThrow("Invalid Nova Eve event path")
      expect(calls).toHaveLength(1)
    }
    const { client, calls } = fixture([json(admission, 302)])
    await expect(client.admit("session-1", input)).rejects.toThrow("HTTP 302")
    expect(calls).toHaveLength(1)
  })

  test("constructs its own event route and reconnects after the last cursor without duplicates", async () => {
    const first = { cursor: "001", event: { type: "text", content: "first" } }
    const second = { cursor: "002", event: { type: "finish", reason: "stop" } }
    const { client, calls, delays } = fixture([
      json({ events: [first], terminal: false }),
      new TypeError("network credential must not leak"),
      json({ events: [first, second], terminal: true }),
    ])
    expect(await collect(client.follow("session-1", "run-1"))).toEqual([first, second])
    expect(calls.map(call => call.url)).toEqual([origin + path, origin + path + "?after=001", origin + path + "?after=001"])
    expect(calls.every(call => call.init?.method === "GET" && call.init.redirect === "error")).toBe(true)
    expect(delays).toEqual([1000, 1000])
  })

  test("preserves canonical text and reasoning content events", async () => {
    const events = [
      { cursor: "001", event: { type: "reasoning", content: "thinking" } },
      { cursor: "002", event: { type: "text", content: "answer" } },
    ]
    const { client } = fixture([json({ events, terminal: true })])
    expect(await collect(client.follow("session-1", "run-1"))).toEqual(events)
  })

  test("stopping observation never cancels the remote run", async () => {
    const controller = new AbortController()
    const { client, calls } = fixture([json({ events: [], terminal: false })], { delay: async () => { controller.abort(); controller.signal.throwIfAborted() } })
    await expect(collect(client.follow("session-1", "run-1", controller.signal))).rejects.toThrow()
    expect(calls.map(call => call.init?.method)).toEqual(["GET"])
  })

  test("cancels only with an explicit DELETE", async () => {
    const { client, calls } = fixture([new Response(null, { status: 204 })])
    await client.cancel("session-1", "run-1")
    expect(calls[0]?.url).toBe(origin + path.replace(/\/events$/, ""))
    expect(calls[0]?.init?.method).toBe("DELETE")
  })

  test("validates runtime IDs and empty tokens without sending requests", async () => {
    const { client, calls } = fixture([])
    await expect(client.admit("../escape", input)).rejects.toThrow("Invalid Nova session or run ID")
    await expect(collect(client.follow("session-1", "run/escape"))).rejects.toThrow()
    await expect(client.cancel("session-1", "x".repeat(129))).rejects.toThrow()
    expect(calls).toHaveLength(0)
    expect(() => createEveClient({ origin, token: "" })).toThrow()
    await expect(client.admit("session-1", { ...input, model: "" })).rejects.toThrow("Invalid Eve message or model selection")
    expect(calls).toHaveLength(0)
  })

  test("bounds reconnect attempts and observation lifetime", async () => {
    const { client, calls, delays } = fixture(Array.from({ length: 6 }, () => new TypeError("secret")))
    await expect(collect(client.follow("session-1", "run-1"))).rejects.toThrow("observation interrupted")
    expect(calls).toHaveLength(6)
    expect(delays).toEqual([1000, 2000, 4000, 8000, 10000])
    let clock = 0
    const expired = fixture([], { now: () => { clock += 900_000; return clock } })
    await expect(collect(expired.client.follow("session-1", "run-1"))).rejects.toThrow("observation timed out")
    expect(expired.calls).toHaveLength(0)
  })

  test("auth, HTTP and invalid responses fail without exposing raw error bodies", async () => {
    for (const [status, message] of [[401, "authentication failed"], [403, "access denied"], [500, "HTTP 500"]] as const) {
      const { client, calls } = fixture([json({ error: "secret" }, status)])
      await expect(collect(client.follow("session-1", "run-1"))).rejects.toThrow(message)
      expect(calls).toHaveLength(1)
    }
    await expect(collect(fixture([json({ events: [{ cursor: "", event: {} }], terminal: true })]).client.follow("session-1", "run-1"))).rejects.toThrow("Invalid Nova Eve event")
  })
})

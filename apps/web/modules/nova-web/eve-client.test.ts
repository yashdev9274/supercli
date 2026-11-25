import { expect, test } from "bun:test"
import { eveCommand, followEveEvents, submitEveTurn } from "./eve-client"

const cursor = (index: number) => `nova-eve:run:event:000000000000:${String(index).padStart(6, "0")}`
const json = (value: unknown, status = 200) => Response.json(value, { status })

test("Eve is an explicit read-only opt-in and invalid resume commands never fall back", () => {
  expect(eveCommand("normal question")).toBeNull()
  expect(eveCommand("/eve question")).toEqual({ content: "question", defaultEffort: false })
  expect(eveCommand("/eve --default-effort question")).toEqual({ content: "question", defaultEffort: true })
  expect(eveCommand("/eve-resume")).toMatchObject({ resume: true })
  expect(eveCommand("/eve-resume run_one")).toMatchObject({ resume: true, runId: "run_one" })
  expect(() => eveCommand("/eve-resume ../other")).toThrow()
  expect(() => eveCommand("/eve")).toThrow()
})

test("observation reconnects from a stable cursor and deduplicates replay", async () => {
  const urls: string[] = []
  let calls = 0
  const fetcher = (async (url) => {
    urls.push(String(url))
    calls++
    if (calls === 1) throw new TypeError("offline")
    return json(calls === 2
      ? { terminal: false, events: [{ cursor: cursor(1), event: { type: "text", content: "hello" } }] }
      : { terminal: true, events: [{ cursor: cursor(1), event: { type: "text", content: "hello" } }, { cursor: cursor(2), event: { type: "text", content: "world" } }] })
  }) as typeof fetch
  const events = []
  for await (const event of followEveEvents("session", "run", { fetch: fetcher, delay: async () => {} })) events.push(event)
  expect(events.filter((event) => event.type === "text").map((event) => event.content)).toEqual(["hello", "world"])
  expect(urls[2]).toContain(encodeURIComponent(cursor(1)))
  expect(urls.every((url) => url.startsWith("/api/nova/sessions/session/eve/run/events"))).toBe(true)
})

test("stopping observation does not request execution cancellation", async () => {
  const calls: Array<{ method?: string }> = []
  const signal = new AbortController()
  const fetcher = (async (_url, init) => {
    calls.push({ method: init?.method })
    return json({ terminal: false, events: [{ cursor: cursor(1), event: { type: "text", content: "running" } }] })
  }) as typeof fetch
  const iterator = followEveEvents("session", "run", { fetch: fetcher, signal: signal.signal, delay: async () => {} })
  await iterator.next()
  await iterator.next()
  signal.abort()
  await expect(iterator.next()).rejects.toThrow()
  expect(calls.every((call) => call.method !== "DELETE")).toBe(true)
})

test("submission preserves selection and stopping its observer does not start legacy execution", async () => {
  let body: any
  let calls = 0
  const fetcher = (async (url, init) => {
    calls++
    expect(String(url)).toBe("/api/nova/sessions/session/eve")
    body = JSON.parse(String(init?.body))
    return json({ runtime: "eve", runId: "run", latestSequence: 2, userMessage: { id: "message", sessionId: "session", role: "user", content: "Question" } }, 202)
  }) as typeof fetch
  const iterator = submitEveTurn("session", { content: "Question", clientMessageId: "client", provider: "openai", model: "selected", mode: "chat" }, fetcher)
  expect((await iterator.next()).value?.type).toBe("user_message")
  await iterator.return(undefined)
  expect(body).toEqual({ content: "Question", clientMessageId: "client", provider: "openai", model: "selected", mode: "chat" })
  expect(calls).toBe(1)
})

test("attachments, mutation mode and malformed events fail closed", async () => {
  const fail = (async (_url: unknown) => { throw new Error("must not fetch") }) as unknown as typeof fetch
  await expect(submitEveTurn("session", { content: "write", provider: "openai", model: "model", mode: "agent" }, fail).next()).rejects.toThrow("text-only")
  await expect(submitEveTurn("session", { content: "read", provider: "openai", model: "model", mode: "chat", references: [{}] }, fail).next()).rejects.toThrow("text-only")
  const bad = (async (_url) => json({ terminal: true, events: [{ cursor: cursor(1), event: { type: "text" } }] })) as typeof fetch
  const iterator = followEveEvents("session", "run", { fetch: bad })
  await iterator.next()
  await expect(iterator.next()).rejects.toThrow("payload")
})

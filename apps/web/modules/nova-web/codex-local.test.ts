import { describe, expect, test } from "bun:test"
import { isLocalNova, LocalCodexClient, localStatusSchema, readLocalEvents } from "./codex-local"

async function collect(chunks: Uint8Array[], signal = new AbortController().signal) {
  const stream = new ReadableStream<Uint8Array>({ start(controller) { for (const chunk of chunks) controller.enqueue(chunk); controller.close() } })
  const events = []
  for await (const event of readLocalEvents(stream, signal)) events.push(event)
  return events
}
const encode = (value: string) => new TextEncoder().encode(value)

describe("local Codex browser connection", () => {
  test("requires explicit profile mode and only accepts local origins", () => {
    const status = { account: null, login: "idle", workspace: "fixture", readOnly: true, profile: "existing" }
    expect(localStatusSchema.parse(status).profile).toBe("existing")
    expect(() => localStatusSchema.parse({ ...status, profile: "unknown" })).toThrow()
    expect(isLocalNova("http://localhost:3003")).toBe(true)
    expect(isLocalNova("https://nova.example")).toBe(false)
    expect(() => new LocalCodexClient(43127, "https://nova.example")).toThrow()
  })

  test("requires terminal completion and supports fragmented UTF-8 text", async () => {
    const data = encode('{"type":"text","content":"héllo"}\n{"type":"finish","reason":"completed"}\n')
    expect(await collect(Array.from(data, (byte) => new Uint8Array([byte])))).toEqual([{ type: "text", content: "héllo" }, { type: "finish", reason: "completed" }])
    await expect(collect([encode('{"type":"text","content":"partial"}\n')])).rejects.toThrow("before completion")
    await expect(collect([new Uint8Array([0xff])])).rejects.toThrow()
    const controller = new AbortController()
    controller.abort()
    await expect(collect([], controller.signal)).rejects.toThrow()
  })

  test("pairs, parses shared status and forgets authorization after unpair", async () => {
    const calls: Array<{ path: string; auth: string | null }> = []
    const fetcher = (async (input: string | URL | Request, options?: RequestInit) => {
      const path = new URL(String(input)).pathname
      calls.push({ path, auth: new Headers(options?.headers).get("Authorization") })
      if (path === "/pair") return Response.json({ token: "x".repeat(32), expiresAt: Date.now() + 60_000 })
      if (path === "/status") return Response.json({ account: { email: "fixture@example.test", planType: "plus" }, login: "idle", workspace: "fixture", readOnly: true, profile: "existing" })
      return Response.json({ ok: true })
    }) as typeof fetch
    const client = new LocalCodexClient(43127, "http://localhost:3003", fetcher)
    await expect(client.status()).rejects.toThrow("pair again")
    await client.pair("fixture-code")
    expect((await client.status()).profile).toBe("existing")
    await client.unpair()
    await expect(client.status()).rejects.toThrow("pair again")
    expect(calls.map(({ path }) => path)).toEqual(["/pair", "/status", "/unpair"])
    expect(calls[0]?.auth).toBeNull()
    expect(calls[1]?.auth).toBe(`Bearer ${"x".repeat(32)}`)
  })
})

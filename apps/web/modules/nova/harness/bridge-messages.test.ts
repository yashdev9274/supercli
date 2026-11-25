import { expect, spyOn, test } from "bun:test"

import { startSchema } from "../../../../supercode-cli/server/src/nova-bridge/protocol"
import { formatLocalAttachmentsContext, localAttachmentsSchema } from "../attachments/contracts"
import { prepareBridgeMessages, streamOriginalHarness } from "./bridge"
import { createBridgeFixture } from "./bridge-fixture.test-helper"

test("packed local files reach the CLI bridge without violating its message limit", async () => {
  const files = localAttachmentsSchema.parse(Array.from({ length: 2 }, (_, index) => ({
    id: `source-${index}`, name: `source-${index}.ts`, kind: "text", mediaType: "text/plain", size: 120_000, text: "x".repeat(120_000),
  })))
  const content = formatLocalAttachmentsContext(files)
  const body = { version: "nova-cli-harness/1", mode: "agent", messages: [{ role: "user", content }], tools: [], budget: 30 }
  expect(startSchema.safeParse(body).success).toBe(false)
  let forwarded: unknown
  const fixture = createBridgeFixture()
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(Object.assign(async (_url: Parameters<typeof fetch>[0], options?: Parameters<typeof fetch>[1]) => {
    const request = new Request(String(_url), options)
    const value = JSON.parse(String(options?.body))
    if (new URL(request.url).pathname.endsWith("/turn")) {
      forwarded = value
      const parsed = startSchema.safeParse(forwarded)
      if (!parsed.success) return Response.json({ error: "Invalid CLI harness protocol" }, { status: 400 })
      expect(parsed.data.messages.map((message) => message.content).join("")).toBe(content)
    }
    return await fixture(request, value) ?? new Response(null, { status: 404 })
  }, { preconnect: globalThis.fetch.preconnect }))
  try {
    const events = []
    for await (const event of streamOriginalHarness({
      token: "fixture", provider: "fixture", model: "fixture", mode: "agent", messages: [{ role: "user", content }], tools: [], execute: async () => ({}),
      chatTransport: async function* (input) {
        expect(input.messages.filter((message) => message.role === "user").map((message) => message.content).join("")).toBe(content)
        yield { type: "text", content: "Read the packed sources." }
        yield { type: "finish", reason: "stop" }
      },
    })) events.push(event)
    expect(events.some((event) => event.type === "finish")).toBe(true)
    expect(startSchema.safeParse(forwarded).success).toBe(true)
  } finally {
    fetchSpy.mockRestore()
  }
})

test("bridge splitting preserves roles, order, and Unicode without mutating messages", () => {
  const content = "a".repeat(199_999) + "😀" + "b".repeat(200_001)
  const original = [{ role: "user" as const, content }]
  const prepared = prepareBridgeMessages(original)
  expect(prepared.map((message) => message.content).join("")).toBe(content)
  expect(prepared.every((message) => message.role === "user" && String(message.content).length <= 200_000)).toBe(true)
  expect(prepared[0]?.content).toBe("a".repeat(199_999))
  expect(original).toEqual([{ role: "user", content }])
  const small = { role: "system" as const, content: "Keep this first" }
  expect(prepareBridgeMessages([small, ...original])[0]).toBe(small)
})

test("oversized conversation counts fail explicitly rather than losing source context", () => {
  expect(() => prepareBridgeMessages(Array.from({ length: 101 }, () => ({ role: "user", content: "source" })))).toThrow("100-message limit")
})

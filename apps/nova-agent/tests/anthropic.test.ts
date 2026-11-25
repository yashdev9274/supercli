import { expect, test } from "bun:test"
import { generateText, streamText, stepCountIs, tool, jsonSchema } from "ai"
import { createTenantAnthropicModel } from "../lib/provider-selection"
import { anthropicFixture } from "./anthropic-fixture"

const tools = { runtime_info: tool({ inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }), execute: async () => ({ verified: true }) }) }
const messages = [{ role: "user" as const, content: "Verify capabilities" }]
const modelFor = (fixture: ReturnType<typeof anthropicFixture>, fetcher = fixture.fetcher) => createTenantAnthropicModel(fixture.scope, { scopeStore: fixture.scopeStore, readConfig: async () => fixture.config, env: fixture.env, fetch: fetcher })

test("native Anthropic Messages assembles tool_use and pairs native tool_result blocks", async () => {
  const fixture = anthropicFixture()
  const result = streamText({ model: modelFor(fixture), messages, tools, stopWhen: stepCountIs(3) })
  let text = ""
  for await (const part of result.textStream) text += part
  expect(text).toBe("Anthropic verified 👋")
  expect(fixture.requests).toHaveLength(2)
  expect(fixture.requests.every((request) => request.url === "https://api.anthropic.com/v1/messages" && request.key === fixture.config.apiKey)).toBe(true)
  expect(fixture.requests[0].body.tools[0]).toMatchObject({ name: "runtime_info", input_schema: { type: "object" } })
  expect(fixture.requests[1].body.messages.flatMap((message: any) => message.content)).toContainEqual(expect.objectContaining({ type: "tool_result", tool_use_id: "tool_fixture" }))
  expect((await result.totalUsage).inputTokens).toBe(20)
})

test("serialized native continuation survives a fresh model and rejects another connection", async () => {
  const fixture = anthropicFixture()
  const first = await generateText({ model: modelFor(fixture), messages, tools, stopWhen: stepCountIs(1) })
  const saved = JSON.parse(JSON.stringify(first.response.messages))
  expect(JSON.stringify(saved)).not.toContain(fixture.config.apiKey!)
  expect((await generateText({ model: modelFor(fixture), messages: [...messages, ...saved], tools })).text).toContain("Anthropic verified")
  fixture.scope.connectionId = "another"
  fixture.state.connectionId = "another"
  await expect(generateText({ model: modelFor(fixture), messages: [...messages, ...saved], tools })).rejects.toThrow("another connection")
  expect(fixture.requests).toHaveLength(2)
})

test("incomplete, malformed and length-limited native responses never execute tools", async () => {
  for (const failure of ["no-stop", "length", "bad-json", "late-error", "truncated"]) {
    const fixture = anthropicFixture()
    let wire = fixture.wire(false)
    if (failure === "no-stop") wire = wire.replace(/event: message_stop[\s\S]*$/, "")
    if (failure === "length") wire = fixture.wire(false, "max_tokens")
    if (failure === "bad-json") wire = wire.replace('"partial_json":"}"', '"partial_json":"oops}"')
    if (failure === "late-error") wire += 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"private-secret"}}\n\n'
    if (failure === "truncated") wire = wire.slice(0, 200)
    const fetcher = (async (_url) => new Response(wire, { headers: { "Content-Type": "text/event-stream" } })) as typeof fetch
    let executed = 0
    let error: unknown
    try { await generateText({ model: modelFor(fixture, fetcher), messages, maxRetries: 0, tools: { runtime_info: tool({ inputSchema: jsonSchema({ type: "object" }), execute: async () => { executed++; return {} } }) } }) } catch (failure) { error = failure }
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain("private-secret")
    expect(executed).toBe(0)
  }
})

test("native connection revocation and incompatible endpoints fail before network calls", async () => {
  for (const scenario of ["revoked", "endpoint", "protocol", "effort"]) {
    const fixture = anthropicFixture()
    if (scenario === "revoked") fixture.state.active = false
    if (scenario === "endpoint") fixture.config.baseUrl = "http://127.0.0.1:6379"
    if (scenario === "protocol") fixture.config.apiFamily = "openai"
    if (scenario === "effort") fixture.scope.effort = "high"
    await expect(generateText({ model: modelFor(fixture), messages })).rejects.toThrow()
    expect(fixture.requests).toHaveLength(0)
  }
})

test("native text arrives before completion and cancelling observation releases the upstream read", async () => {
  const fixture = anthropicFixture()
  const abort = new AbortController()
  let cancelled = false
  const wire = fixture.wire(true).split("event: content_block_stop")[0]
  const fetcher = (async (_url) => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(wire)) },
    cancel() { cancelled = true },
  }), { headers: { "Content-Type": "text/event-stream" } })) as typeof fetch
  const response = await modelFor(fixture, fetcher).doStream({ prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }], abortSignal: abort.signal })
  const reader = response.stream.getReader()
  let text = ""
  while (!text) {
    const next = await reader.read()
    if (next.done) throw new Error("Ended before text")
    if (next.value.type === "text-delta") text += next.value.delta
  }
  expect(text).toBe("Anthropic verified 👋")
  abort.abort()
  try { while (!(await reader.read()).done) {} } catch {}
  await reader.cancel().catch(() => {})
  expect(cancelled).toBe(true)
})

import { expect, test } from "bun:test"
import { generateText, streamText, tool, jsonSchema, stepCountIs } from "ai"
import { OPENAI_COMPATIBLE_BASE_URLS, type OpenAICompatibleIntegration } from "@super/agent-runtime/integrations"
import { createTenantOpenAICompatibleModel } from "../lib/provider-selection"
import { createOpenAICompatibleModel } from "../lib/openai-compatible-model"
import { compatibleFixture } from "./compatible-fixture"

const tools = { runtime_info: tool({ inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }), execute: async () => ({ runtime: "verified" }) }) }
const messages = [{ role: "user" as const, content: "Verify capabilities" }]
const modelFor = (fixture: ReturnType<typeof compatibleFixture>, fetcher = fixture.fetcher) => createTenantOpenAICompatibleModel(fixture.scope, { scopeStore: fixture.scopeStore, readConfig: async () => fixture.config, fetch: fetcher, env: fixture.env })

for (const provider of Object.keys(OPENAI_COMPATIBLE_BASE_URLS) as OpenAICompatibleIntegration[]) {
  test(`${provider} adapter completes a fragmented tool cycle with scoped credentials`, async () => {
    const fixture = compatibleFixture(provider)
    const result = streamText({ model: modelFor(fixture), tools, messages, stopWhen: stepCountIs(3) })
    let text = ""
    for await (const chunk of result.textStream) text += chunk
    expect(text).toContain("Verified 👋")
    expect(fixture.requests).toHaveLength(2)
    expect(fixture.requests.every((request) => request.authorization === "Bearer synthetic-compatible-key" && request.redirect === "error")).toBe(true)
    expect(fixture.requests[0].url).toBe(`${OPENAI_COMPATIBLE_BASE_URLS[provider]}/chat/completions`)
    expect(fixture.requests[1].body.messages.find((message: any) => message.role === "tool").tool_call_id).toBe("call_one")
    expect((await result.totalUsage).inputTokens).toBe(20)
  })
}

test("serialized continuation resumes with a fresh model and rejects another connection", async () => {
  const fixture = compatibleFixture()
  const first = await generateText({ model: modelFor(fixture), messages, tools, stopWhen: stepCountIs(1) })
  const saved = JSON.parse(JSON.stringify(first.response.messages))
  expect(JSON.stringify(saved)).not.toContain(fixture.config.apiKey!)
  expect((await generateText({ model: modelFor(fixture), messages: [...messages, ...saved], tools })).text).toContain("Verified")
  fixture.scope.connectionId = "another-connection"
  fixture.state.connectionId = fixture.scope.connectionId
  await expect(generateText({ model: modelFor(fixture), messages: [...messages, ...saved], tools })).rejects.toThrow()
  expect(fixture.requests).toHaveLength(2)
})

test("revocation and credential generation changes stop inference before the network", async () => {
  for (const property of ["active", "enabled", "connectionId"] as const) {
    const fixture = compatibleFixture()
    if (property === "connectionId") fixture.state.connectionId = "changed"
    else fixture.state[property] = false
    await expect(generateText({ model: modelFor(fixture), messages, tools })).rejects.toThrow()
    expect(fixture.requests).toHaveLength(0)
  }
})

test("incomplete or invalid streams never execute buffered tool calls", async () => {
  for (const failure of ["missing-done", "malformed-json", "late-error", "truncated", "length"]) {
    const fixture = compatibleFixture()
    let executions = 0
    let wire = fixture.response([])
    if (failure === "missing-done") wire = wire.replace("data: [DONE]\n\n", "")
    if (failure === "malformed-json") wire = wire.replace('"arguments":"}"', '"arguments":"oops}"')
    if (failure === "late-error") wire = wire.replace("data: [DONE]", 'data: {"error":{"message":"synthetic-compatible-key"}}\n\ndata: [DONE]')
    if (failure === "truncated") wire = wire.slice(0, 100)
    if (failure === "length") wire = wire.replace('"finish_reason":"tool_calls"', '"finish_reason":"length"')
    const fetcher = (async (_url) => new Response(wire, { headers: { "Content-Type": "text/event-stream" } })) as typeof fetch
    let error: unknown
    try { await generateText({ model: modelFor(fixture, fetcher), messages, tools: { runtime_info: tool({ inputSchema: jsonSchema({ type: "object" }), execute: async () => { executions++; return {} } }) }, maxRetries: 0 }) } catch (failure) { error = failure }
    expect(error).toBeInstanceOf(Error)
    expect(String(error)).not.toContain("synthetic-compatible-key")
    expect(executions).toBe(0)
  }
})

test("private endpoints, redirects, protocol mismatches and unsupported reasoning fail closed", async () => {
  for (const config of [{ baseUrl: "http://127.0.0.1:6379" }, { baseUrl: "https://api.openai.com/v1?redirect=other" }, { apiFamily: "anthropic" as const }, { headers: { Authorization: "override" } }]) {
    const fixture = compatibleFixture()
    Object.assign(fixture.config, config)
    await expect(generateText({ model: modelFor(fixture), messages })).rejects.toThrow()
    expect(fixture.requests).toHaveLength(0)
  }
  const fixture = compatibleFixture()
  fixture.scope.effort = "high"
  await expect(generateText({ model: modelFor(fixture), messages })).rejects.toThrow()
  expect(fixture.requests).toHaveLength(0)
  expect(() => modelFor(compatibleFixture("cursor"))).toThrow("different")
})

test("text streams before completion and abort cancels the pending provider body", async () => {
  const fixture = compatibleFixture()
  let cancelled = false
  const abort = new AbortController()
  const fetcher = (async (_url) => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"id":"response","created":1,"model":"fixture-model","choices":[{"index":0,"delta":{"role":"assistant","content":"live"},"finish_reason":null}]}\n\n'))
    },
    cancel() { cancelled = true },
  }), { headers: { "Content-Type": "text/event-stream" } })) as typeof fetch
  const response = await modelFor(fixture, fetcher).doStream({ prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }], abortSignal: abort.signal })
  const reader = response.stream.getReader()
  let text = ""
  while (!text) {
    const next = await reader.read()
    if (next.done) throw new Error("Provider ended before live text")
    if (next.value.type === "text-delta") text += next.value.delta
  }
  expect(text).toBe("live")
  abort.abort()
  try { while (!(await reader.read()).done) {} } catch {}
  await reader.cancel().catch(() => {})
  expect(cancelled).toBe(true)
})

test("raw payloads, structured outputs and credential overrides are rejected before reading keys", async () => {
  const fixture = compatibleFixture()
  let reads = 0
  const model = createOpenAICompatibleModel({ scope: fixture.scope, authorize: async () => { reads++; return fixture.config } })
  const prompt = [{ role: "user" as const, content: [{ type: "text" as const, text: "test" }] }]
  for (const options of [{ includeRawChunks: true }, { responseFormat: { type: "json" as const } }, { providerOptions: { "nova-compatible": { model: "override" } } }, { headers: { authorization: "override" } }]) {
    const { stream } = await model.doStream({ prompt, ...options })
    const reader = stream.getReader()
    await expect(reader.read()).rejects.toThrow()
    reader.releaseLock()
  }
  expect(reads).toBe(0)
})

test("HTTP failures are redacted and toolChoice none cannot execute provider tool calls", async () => {
  const fixture = compatibleFixture()
  const denied = (async (_url) => new Response("synthetic-compatible-key", { status: 401 })) as typeof fetch
  await expect(generateText({ model: modelFor(fixture, denied), messages })).rejects.toThrow("HTTP 401")
  let executed = 0
  await expect(generateText({ model: modelFor(fixture), messages, toolChoice: "none", tools: { runtime_info: tool({ inputSchema: jsonSchema({ type: "object" }), execute: async () => { executed++; return {} } }) } })).rejects.toThrow()
  expect(executed).toBe(0)
})

import { expect, test } from "bun:test"
import { generateText, streamText, tool, jsonSchema, stepCountIs, type ModelMessage } from "ai"

import { createTenantCodexModel } from "../lib/codex-selection"
import { createEveCodexModel } from "../lib/codex-model"
import { codexFixture, fixtureScope } from "./codex-fixture"

const tools = {
  runtime_info: tool({ inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }), execute: async () => ({ repositoryAccess: false }) }),
}
const messages: ModelMessage[] = [{ role: "user", content: "Verify the runtime" }]
const modelFor = (fixture: ReturnType<typeof codexFixture>) => createTenantCodexModel(fixture.scope, {
  scopeStore: fixture.scopeStore, context: async () => fixture.context, fetch: fixture.fetcher, env: fixture.env,
})

test("AI SDK streams the hosted Codex protocol through tools with native reasoning preserved", async () => {
  const fixture = codexFixture()
  const result = streamText({ model: modelFor(fixture), tools, messages, stopWhen: stepCountIs(3) })
  const chunks = []
  for await (const text of result.textStream) chunks.push(text)
  expect(chunks.join("")).toContain("Runtime verified:")
  expect(fixture.requests).toHaveLength(2)
  expect(fixture.requests[1].body.input).toContainEqual(expect.objectContaining({ encrypted_content: "synthetic-encrypted-user_one" }))
  expect(fixture.requests[1].body.input).toContainEqual(expect.objectContaining({ type: "function_call_output", call_id: "call_user_one" }))
  expect(fixture.requests.every((request) => request.authorization === "Bearer synthetic-access-user_one")).toBe(true)
  expect(fixture.requests[1].body.input.filter((item: any) => item.type === "reasoning")).toHaveLength(1)
})

async function checkpoint(fixture: ReturnType<typeof codexFixture>) {
  const first = await generateText({ model: modelFor(fixture), tools, messages, stopWhen: stepCountIs(1) })
  return [...messages, ...JSON.parse(JSON.stringify(first.response.messages))] as ModelMessage[]
}

test("serialized Eve-compatible messages resume with a newly created model, without mutable process state", async () => {
  const fixture = codexFixture()
  const saved = await checkpoint(fixture)
  const second = await generateText({ model: modelFor(fixture), tools, messages: saved, stopWhen: stepCountIs(2) })
  expect(second.text).toContain("Runtime verified:")
  expect(fixture.requests).toHaveLength(2)
  expect(JSON.stringify(saved)).not.toContain("synthetic-access")
  expect(JSON.stringify(saved)).not.toContain("synthetic-refresh")
})

test("cross-tenant continuation and credential owners are rejected before provider requests", async () => {
  const first = codexFixture()
  const saved = await checkpoint(first)
  const other = codexFixture(fixtureScope("two"))
  await expect(generateText({ model: modelFor(other), tools, messages: saved })).rejects.toThrow("another account scope")
  expect(other.requests).toHaveLength(0)
  const mixed = createTenantCodexModel(other.scope, { scopeStore: other.scopeStore, context: async () => first.context, fetch: first.fetcher, env: other.env })
  await expect(generateText({ model: mixed, tools, messages })).rejects.toThrow("credential owner")
  expect(first.requests).toHaveLength(1)
})

test("changing the selected model cannot silently reuse model-bound native state", async () => {
  const fixture = codexFixture()
  const saved = await checkpoint(fixture)
  const otherModel = createTenantCodexModel({ ...fixture.scope, model: "other-model" }, {
    scopeStore: fixture.scopeStore, context: async () => fixture.context, fetch: fixture.fetcher, env: fixture.env,
  })
  await expect(generateText({ model: otherModel, tools, messages: saved })).rejects.toThrow("another account scope or model")
  expect(fixture.requests).toHaveLength(1)
})

test("membership revocation and feature disable stop the next inference without provider fallback", async () => {
  const fixture = codexFixture()
  const saved = await checkpoint(fixture)
  fixture.state.active = false
  await expect(generateText({ model: modelFor(fixture), tools, messages: saved })).rejects.toThrow("no longer authorized")
  fixture.state.active = true
  fixture.env.NOVA_EVE_ENABLED = "false"
  await expect(generateText({ model: modelFor(fixture), tools, messages: saved })).rejects.toThrow("no longer authorized")
  expect(fixture.requests).toHaveLength(1)
})

test("401 rotates only the scoped credential and does not put credentials into conversation metadata", async () => {
  const fixture = codexFixture()
  fixture.state.requireRotation = true
  const saved = await checkpoint(fixture)
  expect(fixture.state.rotations).toBe(1)
  expect(fixture.requests[0].authorization).toBe("Bearer synthetic-rotated-user_one")
  expect(JSON.stringify(saved)).not.toContain("synthetic-rotated")
  expect(JSON.stringify(saved)).not.toContain("synthetic-refresh")
})

test("missing or mismatched native tool state fails before requesting inference", async () => {
  const fixture = codexFixture()
  const saved = await checkpoint(fixture)
  const bad = JSON.parse(JSON.stringify(saved))
  const assistant = bad.find((message: any) => message.role === "assistant")
  assistant.content.find((part: any) => part.type === "tool-call").providerOptions.novaCodex.output.find((item: any) => item.type === "function_call").call_id = "wrong-call"
  await expect(generateText({ model: modelFor(fixture), tools, messages: bad })).rejects.toThrow("does not match")
  expect(fixture.requests).toHaveLength(1)
})

test("text arrives before provider completion and cancellation releases a pending inference", async () => {
  let cancelled = false
  const model = createEveCodexModel({ model: "fixture-model", scope: "fixture", authorize: async (signal) => async function* () {
    try {
      yield { type: "text", content: "live" }
      signal!.throwIfAborted()
      await new Promise<void>((_, reject) => signal!.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }))
      return { output: [], calls: [] }
    } finally { cancelled = signal!.aborted }
  } })
  const result = await model.doStream({ prompt: [{ role: "user", content: [{ type: "text", text: "test" }] }] })
  const reader = result.stream.getReader()
  expect((await reader.read()).value?.type).toBe("stream-start")
  expect((await reader.read()).value?.type).toBe("text-start")
  expect((await reader.read()).value).toMatchObject({ type: "text-delta", delta: "live" })
  await reader.cancel().catch(() => {})
  expect(cancelled).toBe(true)
})

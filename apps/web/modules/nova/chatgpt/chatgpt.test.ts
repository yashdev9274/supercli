import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

import { prepareAuthorization, consumeAuthorization, validateAuthorizationIdentity, type AuthorizationTransaction, type AuthorizationTransactionStore } from "./authorization"
import { assertChatGPTHostedAvailable, assertConnectionOwner, connectionView, hasPlanPermission, type ChatGPTConnectionRecord } from "./contracts"
import { parseAccountModels, prepareResponsesRequest, ResponsesAccumulator, continueResponsesRequest } from "./responses"

const owner = { userId: "user-a", organizationId: "org-a", browserSessionId: "browser-a" }
const config = { clientId: "oaiapp_test", redirectUri: "https://nova.example/auth/callback", allowedRedirectUris: ["https://nova.example/auth/callback"] }
function setup() {
  const pending = new Map<string, AuthorizationTransaction>()
  const store: AuthorizationTransactionStore = {
    async put(transaction) { pending.set(transaction.state, transaction) },
    async take(state, caller) {
      const transaction = pending.get(state)
      if (!transaction || Object.keys(owner).some((key) => transaction[key as keyof typeof owner] !== caller[key as keyof typeof owner])) return null
      pending.delete(state)
      return transaction
    },
  }
  const transaction = prepareAuthorization(owner, config, 100)
  const callback = new URL(config.redirectUri)
  callback.search = new URLSearchParams({ state: transaction.state, code: "test-code" }).toString()
  return { store, transaction, callback }
}

const models = [{ id: "test-model", label: "Test model" }]
function request() {
  return prepareResponsesRequest({ model: "test-model", models, messages: [{ role: "system", content: "Instructions" }, { role: "user", content: "Hello" }] })
}
function completion(output: Record<string, unknown>[] = []) {
  return { type: "response.completed", response: { status: "completed", output } }
}
const functionCall = { type: "function_call", id: "item-1", call_id: "call-1", name: "read_file", namespace: "nova", arguments: '{"path":"index.ts"}' }

describe("ChatGPT authorization contracts (mock only)", () => {
  test("fresh PKCE, state and nonce with exact redirect validation", () => {
    const a = prepareAuthorization(owner, config, 100)
    const b = prepareAuthorization(owner, config, 100)
    expect(a.state).not.toBe(b.state)
    expect(a.nonce).not.toBe(b.nonce)
    expect(a.codeVerifier).not.toBe(b.codeVerifier)
    expect(a.codeChallenge).toBe(createHash("sha256").update(a.codeVerifier).digest("base64url"))
    expect(a.expiresAt).toBe(600100)
    for (const redirectUri of ["http://nova.example/auth/callback", "https://attacker.example/auth/callback", `${config.redirectUri}?next=bad`]) {
      expect(() => prepareAuthorization(owner, { ...config, redirectUri })).toThrow()
    }
    expect(() => prepareAuthorization(owner, { ...config, clientId: "dynamic_agent_client" })).toThrow()
  })

  test("consumes a callback once, even under concurrent attempts", async () => {
    const { store, transaction, callback } = setup()
    await store.put(transaction)
    const outcomes = await Promise.allSettled([consumeAuthorization(store, owner, callback, 101), consumeAuthorization(store, owner, callback, 101)])
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1)
  })

  test("rejects ambiguous callback parameters, credentials and fragments", async () => {
    for (const scenario of ["state", "code", "error", "client_id", "credentials", "fragment"]) {
      const { store, transaction, callback } = setup()
      await store.put(transaction)
      if (scenario === "credentials") callback.username = "unexpected"
      else if (scenario === "fragment") callback.hash = "unexpected"
      else {
        callback.searchParams.append(scenario, "first")
        callback.searchParams.append(scenario, "second")
      }
      await expect(consumeAuthorization(store, owner, callback, 101)).rejects.toThrow()
    }
  })

  test("rejects expired, denied, wrong-client and wrong-origin callbacks", async () => {
    for (const scenario of ["expired", "denied", "client", "origin", "missing-code", "state"]) {
      const { store, transaction, callback } = setup()
      await store.put(transaction)
      if (scenario === "denied") callback.searchParams.set("error", "access_denied")
      if (scenario === "client") callback.searchParams.set("client_id", "oaiapp_wrong")
      if (scenario === "origin") callback.hostname = "attacker.example"
      if (scenario === "missing-code") callback.searchParams.delete("code")
      if (scenario === "state") callback.searchParams.set("state", "wrong")
      await expect(consumeAuthorization(store, owner, callback, scenario === "expired" ? transaction.expiresAt : 101)).rejects.toThrow()
    }
  })

  test("binds state to user, workspace and browser without consuming another owner's transaction", async () => {
    for (const caller of [{ ...owner, userId: "other" }, { ...owner, organizationId: "other" }, { ...owner, browserSessionId: "other" }]) {
      const { store, transaction, callback } = setup()
      await store.put(transaction)
      await expect(consumeAuthorization(store, caller, callback, 101)).rejects.toThrow()
      expect((await consumeAuthorization(store, owner, callback, 101)).code).toBe("test-code")
    }
  })

  test("requires a verifying adapter and checks the original registration identity", async () => {
    const transaction = prepareAuthorization(owner, config)
    const identity = { issuer: "https://auth.openai.com", subject: "subject-a", clientId: config.clientId }
    const verify = async (_token: string, expected: { nonce: string; clientId: string; issuer: string }) => {
      expect(expected).toEqual({ nonce: transaction.nonce, clientId: config.clientId, issuer: identity.issuer })
      return identity
    }
    expect(await validateAuthorizationIdentity({ transaction, idToken: "fixture", verify })).toEqual(identity)
    await expect(validateAuthorizationIdentity({ transaction, idToken: "fixture", verify, previous: { ...identity, subject: "subject-b" } })).rejects.toThrow()
    await expect(validateAuthorizationIdentity({ transaction, idToken: "fixture", verify: async () => { throw new Error("Invalid signature") } })).rejects.toThrow("Invalid signature")
    expect(hasPlanPermission(["openid", "profile", "email"])).toBe(false)
    expect(hasPlanPermission(["chatgpt.tokens.use.direct"])).toBe(false)
    expect(hasPlanPermission(["resource.invoke", "chatgpt.tokens.use.direct"])).toBe(true)
  })

  test("projects only display fields and rejects other owners", () => {
    const record: ChatGPTConnectionRecord = { id: "connection-a", userId: owner.userId, organizationId: owner.organizationId, issuer: "https://auth.openai.com", subject: "private-subject", clientId: config.clientId, label: "Personal", status: "connected", scopes: [], credentialRef: "private-reference", expiresAt: 1000, version: 1 }
    expect(connectionView(record, record.id)).toEqual({ id: record.id, label: "Personal", status: "connected", selected: true })
    expect(() => assertConnectionOwner(record, owner)).not.toThrow()
    expect(() => assertConnectionOwner(record, { ...owner, userId: "other" })).toThrow("not found")
    expect(() => assertConnectionOwner(record, { ...owner, organizationId: "other" })).toThrow("not found")
  })
})

describe("ChatGPT Responses contracts (no network)", () => {
  test("catalog preserves server ordering and excludes hidden/duplicate models", () => {
    expect(parseAccountModels({ models: [
      { slug: "second", display_name: "Second", visibility: "list" },
      { slug: "hidden", display_name: "Hidden", visibility: "hidden" },
      { slug: "first", display_name: "First", visibility: "list" },
      { slug: "second", display_name: "Duplicate", visibility: "list" },
    ] })).toEqual([{ id: "second", label: "Second" }, { id: "first", label: "First" }])
    expect(() => parseAccountModels({ data: [] })).toThrow()
  })

  test("sets only allowed request parameters and translates system messages", () => {
    expect(request()).toEqual({ model: "test-model", store: false, stream: true, input: [{ role: "developer", content: "Instructions" }, { role: "user", content: "Hello" }] })
    expect(() => prepareResponsesRequest({ model: "unknown", models, messages: [] })).toThrow("not available")
    expect(() => prepareResponsesRequest({ model: "test-model", models, messages: [{ role: "tool", content: "result", tool_call_id: "call" }] })).toThrow("native Responses")
  })

  test("groups tools into a namespace", () => {
    const prepared = prepareResponsesRequest({ model: "test-model", models, messages: [], tools: [{ type: "function", function: { name: "read_file", description: "Read", parameters: { type: "object" } } }] })
    expect(prepared.tools?.[0]?.type).toBe("namespace")
    expect(prepared.tools?.[0]?.tools[0]?.name).toBe("read_file")
  })

  test("requires a completed terminal event, including after text has streamed", () => {
    const accumulator = new ResponsesAccumulator()
    expect(accumulator.accept({ type: "response.output_text.delta", delta: "hello" })).toEqual([{ type: "text", content: "hello" }])
    expect(() => accumulator.completed()).toThrow()
    expect(accumulator.accept(completion())).toEqual([{ type: "finish", reason: "stop" }])
    expect(accumulator.completed()).toEqual({ output: [], calls: [] })
    expect(() => accumulator.accept(completion())).toThrow("terminal")
  })

  test("never reports success for late quota failures or leaks raw errors", () => {
    const accumulator = new ResponsesAccumulator()
    accumulator.accept({ type: "response.output_text.delta", delta: "partial" })
    const events = accumulator.accept({ type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded", message: "private-token" } } })
    expect(events[0]?.type).toBe("error")
    expect(JSON.stringify(events)).toContain("Manage usage")
    expect(JSON.stringify(events)).not.toContain("private-token")
    expect(() => accumulator.completed()).toThrow()
    for (const type of ["error", "response.incomplete"]) {
      const failed = new ResponsesAccumulator()
      expect(failed.accept({ type })[0]?.type).toBe("error")
      expect(() => failed.completed()).toThrow()
    }
  })

  test("preserves native item/call IDs and encrypted reasoning through tool continuations", () => {
    const accumulator = new ResponsesAccumulator()
    const reasoning = { type: "reasoning", id: "reasoning-1", encrypted_content: "opaque-fixture", summary: [] }
    const events = accumulator.accept(completion([reasoning, functionCall]))
    expect(events[0]).toEqual({ type: "tool-call", toolCallId: "call-1", toolName: "read_file", args: { path: "index.ts" } })
    const next = continueResponsesRequest(request(), accumulator.completed(), [{ callId: "call-1", output: "file contents" }])
    expect(next.input.slice(-3)).toEqual([reasoning, functionCall, { type: "function_call_output", call_id: "call-1", output: "file contents" }])
    expect(() => continueResponsesRequest(request(), accumulator.completed(), [])).toThrow()
    expect(() => continueResponsesRequest(request(), accumulator.completed(), [{ callId: "wrong", output: "bad" }])).toThrow()
  })

  test("malformed events redact payloads and permanently fail the stream", () => {
    for (const event of [null, { type: "response.output_text.delta", delta: { secret: "private-token" } }, completion([{ ...functionCall, arguments: "private-token" }]), { type: "response.completed", response: { status: "private-token" } }]) {
      const accumulator = new ResponsesAccumulator()
      expect(() => accumulator.accept(event)).toThrow("Invalid ChatGPT stream event")
      expect(() => accumulator.completed()).toThrow()
      expect(() => accumulator.accept(completion())).toThrow("terminal")
    }
  })

  test("reports supplied usage and defensively copies completed items", () => {
    const accumulator = new ResponsesAccumulator()
    const usage = { input_tokens: 10, output_tokens: 5, total_tokens: 15 }
    const event = completion([functionCall])
    const events = accumulator.accept({ ...event, response: { ...event.response, usage } })
    expect(events[1]).toEqual({ type: "finish", reason: "tool_calls", usage })
    const result = accumulator.completed()
    result.output.length = 0
    expect(accumulator.completed().output).toHaveLength(1)
    expect(() => continueResponsesRequest(request(), accumulator.completed(), [{ callId: "call-1", output: "a" }, { callId: "call-1", output: "b" }])).toThrow()
  })

  test("rejects malformed tool arguments and duplicate calls before emitting tool actions", () => {
    for (const args of ["[]", "null", "invalid", "1"]) {
      expect(() => new ResponsesAccumulator().accept(completion([{ ...functionCall, arguments: args }]))).toThrow()
    }
    expect(() => new ResponsesAccumulator().accept(completion([functionCall, functionCall]))).toThrow()
    expect(() => new ResponsesAccumulator().accept(completion([{ ...functionCall, namespace: "unknown" }]))).toThrow()
  })
})

describe("hosted approval gate", () => {
  test("cannot be enabled without implementing the hosted contract", () => {
    expect(() => assertChatGPTHostedAvailable()).toThrow("Hosted ChatGPT plan inference is not enabled")
  })

  test("native connection is local-only and provider is not a selectable static model", () => {
    const card = readFileSync(new URL("../../nova-web/components/chatgpt-connection-card.tsx", import.meta.url), "utf8")
    expect(card).toContain("!isLocalNova(origin)")
    expect(card).toContain('status?.profile === "isolated" && status.account')
    const catalog = readFileSync(new URL("../../nova-web/models.ts", import.meta.url), "utf8")
    expect(catalog).not.toContain('provider: "chatgpt"')
  })

  test("turn route rejects ChatGPT before harness auth or starting a run", () => {
    const route = readFileSync(new URL("../../../app/api/nova/sessions/[sessionId]/turn/route.ts", import.meta.url), "utf8")
    const guard = route.indexOf("parsed.data.provider === CHATGPT_PROVIDER")
    expect(guard).toBeGreaterThan(-1)
    const harnessAuth = route.indexOf("harnessAuth = await ensureHarnessToken")
    const run = route.indexOf("for await (const event of runWebTurn")
    expect(harnessAuth).toBeGreaterThan(-1)
    expect(run).toBeGreaterThan(-1)
    expect(guard).toBeLessThan(harnessAuth)
    expect(guard).toBeLessThan(run)
    const turn = readFileSync(new URL("../sessions/turn.ts", import.meta.url), "utf8")
    const directGuard = turn.indexOf("input.provider === CHATGPT_PROVIDER")
    expect(directGuard).toBeGreaterThan(-1)
    const selection = turn.indexOf("const selection =", directGuard)
    const posted = turn.indexOf("await postSessionMessage(", directGuard)
    expect(selection).toBeGreaterThan(-1)
    expect(posted).toBeGreaterThan(-1)
    expect(directGuard).toBeLessThan(selection)
    expect(directGuard).toBeLessThan(posted)
    expect(route).toContain("status: 503")
  })
})

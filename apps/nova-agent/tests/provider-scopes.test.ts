import { expect, test } from "bun:test"
import { generateText, jsonSchema, stepCountIs, tool } from "ai"
import { signNovaScope, verifyNovaScopeToken, authenticateNovaScope, authorizeNovaScope, type NovaScope, type NovaScopeConnection, type NovaScopeStore } from "../lib/scope"
import { createTenantCodexModel } from "../lib/codex-selection"
import { providerConnectionId } from "../lib/scope-store"
import { codexFixture, fixtureScope } from "./codex-fixture"

const secret = "synthetic-provider-registry-scope-signing-key"
const env = { NOVA_EVE_ENABLED: "true", NOVA_EVE_SCOPE_SECRET: secret }
const scope: NovaScope = { organizationId: "org_one", userId: "user_one", membershipId: "member_one", novaSessionId: "session_one", provider: "anthropic", connectionId: "connection_one", model: "account-model" }
const connection = (): NovaScopeConnection => ({ connectionId: "connection_one", provider: "anthropic", organizationId: "org_one", userId: "user_one", membershipId: "member_one", status: "connected", enabled: true })
const store = (row = connection()): NovaScopeStore => ({
  findSession: async () => ({ id: "session_one", organizationId: "org_one", initiatorMembership: { id: "member_one", userId: "user_one", organizationId: "org_one", status: "active" } }),
  findConnection: async () => row,
})

test("registered non-Codex selections authenticate only with their authoritative connection", async () => {
  for (const provider of ["anthropic", "openai", "google", "openrouter", "cursor", "custom", "supercode"] as const) {
    const selected = { ...scope, provider }
    const token = signNovaScope(selected, { secret })
    expect(verifyNovaScopeToken(token, { secret })).toEqual(selected)
    const request = new Request("http://localhost/eve/v1/session", { headers: { authorization: `Bearer ${token}` } })
    expect(await authenticateNovaScope(request, store({ ...connection(), provider }), env)).not.toBeNull()
  }
})

test("a signature cannot bypass connection ownership, provider, state or generation checks", async () => {
  for (const field of ["connectionId", "provider", "organizationId", "userId", "membershipId", "status", "enabled"] as const) {
    const row = { ...connection(), [field]: field === "enabled" ? false : "other" } as NovaScopeConnection
    expect(await authorizeNovaScope(scope, store(row))).toBe(false)
  }
  expect(await authorizeNovaScope(scope, { findSession: store().findSession })).toBe(false)
  expect(await authorizeNovaScope(scope, { ...store(), findConnection: async () => null })).toBe(false)
  expect(await authorizeNovaScope(scope, { ...store(), findConnection: async () => { throw new Error("unavailable") } })).toBe(false)
})

test("unknown integrations and unbound non-Codex connections cannot be signed", () => {
  expect(() => signNovaScope({ ...scope, provider: "unknown" } as unknown as NovaScope, { secret })).toThrow()
  const unbound = { ...scope }
  Reflect.deleteProperty(unbound, "connectionId")
  expect(() => signNovaScope(unbound, { secret })).toThrow()
  expect(() => signNovaScope({ ...scope, connectionId: "" }, { secret })).toThrow()
})

test("registered but unimplemented providers never fall through to Codex", () => {
  expect(() => createTenantCodexModel(scope)).toThrow("cannot execute another provider")
})

test("connection identity changes for another provider, owner or credential revision", () => {
  const first = providerConnectionId("member_one", "openai", "revision-one")
  expect(providerConnectionId("member_one", "openai", "revision-one")).toBe(first)
  expect(providerConnectionId("member_two", "openai", "revision-one")).not.toBe(first)
  expect(providerConnectionId("member_one", "anthropic", "revision-one")).not.toBe(first)
  expect(providerConnectionId("member_one", "openai", "revision-two")).not.toBe(first)
  expect(first).not.toContain("revision-one")
})

test("a changed Codex account is rejected even if the earlier connection lookup raced with it", async () => {
  const connectedAt = new Date("2026-11-21T00:00:00Z")
  const selected = { ...fixtureScope(), connectionId: providerConnectionId("member_one", "codex", connectedAt.toISOString()) }
  const fixture = codexFixture(selected)
  await fixture.context.store.compareAndSwap(1, { connectedAt })
  const scopeStore: NovaScopeStore = {
    ...fixture.scopeStore,
    findConnection: async () => ({ ...connection(), provider: "codex", connectionId: selected.connectionId }),
  }
  const create = () => createTenantCodexModel(selected, { scopeStore, context: async () => fixture.context, fetch: fixture.fetcher, env: fixture.env })
  const messages = [{ role: "user" as const, content: "Verify capabilities" }]
  const tools = { runtime_info: tool({ inputSchema: jsonSchema({ type: "object", properties: {} }), execute: async () => ({ repositoryAccess: false }) }) }
  const first = await generateText({ model: create(), messages, tools, stopWhen: stepCountIs(1) })
  const row = await fixture.context.store.get()
  await fixture.context.store.compareAndSwap(row.version, { connectedAt: new Date("2026-11-22T00:00:00Z") })
  await expect(generateText({ model: create(), messages: [...messages, ...first.response.messages], tools })).rejects.toThrow("connection changed")
  expect(fixture.requests).toHaveLength(1)
})

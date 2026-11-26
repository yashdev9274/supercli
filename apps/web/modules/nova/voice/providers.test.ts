import { afterAll, beforeEach, expect, mock, test } from "bun:test"

import type { CodexRow } from "@super/codex-runtime/service"
import type { VoiceCaller } from "./auth"

let active = true
let vaultReads = 0
let connected = true
const calls: Array<{ path: string; body?: Record<string, unknown> }> = []
const caller: VoiceCaller = { id: "voice-user", email: "voice@example.test", name: "Voice", image: null, harnessToken: "cli-session", sessionId: "voice-session-hash" }
const row: CodexRow = {
  membershipId: "membership", state: "connected", version: 1, encryptedCredentials: "encrypted-test-credentials", encryptedAttempt: null,
  attemptId: null, sessionHash: null, intervalSeconds: 5, expiresAt: null, nextPollAt: null, lastStartedAt: null, connectedAt: new Date(0),
}

mock.module("server-only", () => ({}))
mock.module("@super/db", () => ({ default: {
  user: { findUnique: async ({ where }: { where: { id: string } }) => { expect(where.id).toBe(caller.id); return { organizationId: "org" } } },
  organizationMembership: {
    findUnique: async ({ where }: { where: { organizationId_userId: { userId: string } } }) => { expect(where.organizationId_userId.userId).toBe(caller.id); return { id: "membership", status: active ? "active" : "suspended" } },
    findFirst: async () => active ? { id: "membership" } : null,
  },
  novaCodexConnection: { findUnique: async () => ({ ...row, state: connected ? "connected" : "disconnected" }) },
  novaProviderCredential: {
    findMany: async () => [{ provider: "openai" }],
    findUnique: async () => ({ status: "connected", enabled: true, encryptedApiKey: "encrypted-api-key" }),
  },
} }))
mock.module("@/modules/nova/codex/vault", () => ({ configuredCodexVault: () => ({
  open: (_ciphertext: unknown, binding: string) => {
    expect(binding).toBe(JSON.stringify(["org", caller.id, "membership", "credentials"]))
    vaultReads++
    return { access_token: "synthetic-codex-access", refresh_token: "synthetic-codex-refresh", id_token: "synthetic-id" }
  },
}) }))
mock.module("@/modules/nova/provider-credentials/vault", () => ({
  configuredProviderVault: () => ({ open: () => JSON.stringify({ apiKey: "synthetic-provider-key", baseUrl: "https://provider.example/v1", models: [{ id: "private-model", label: "Private model" }] }) }),
  ProviderCredentialError: class extends Error { statusCode = 400 },
}))

const originalFetch = globalThis.fetch
globalThis.fetch = (async (input, init) => {
  const url = new URL(String(input))
  expect(url.origin).toBe("https://chatgpt.com")
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-codex-access")
  const body = init?.body ? JSON.parse(String(init.body)) : undefined
  calls.push({ path: url.pathname, body })
  if (url.pathname.endsWith("/models")) {
    return Response.json({ models: [{ slug: "account-codex-model", display_name: "Account Codex Model", visibility: "list", supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }], default_reasoning_level: "low" }] })
  }
  return new Response(`data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Codex answered." })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Codex answered." }] }] } })}\n\n`, { headers: { "Content-Type": "text/event-stream" } })
}) as typeof fetch

const { prepareVoiceProvider, voiceModelCatalog } = await import("./providers")

beforeEach(() => { active = true; connected = true; vaultReads = 0; calls.length = 0 })
afterAll(() => { globalThis.fetch = originalFetch })

test("voice uses the connected Codex account and never falls back to cloud", async () => {
  const selection = await prepareVoiceProvider(caller, { provider: "codex", model: "account-codex-model", effort: "low" }, new AbortController().signal)
  expect(selection.provider).toBe("codex")
  expect(selection.chatTransport).toBeFunction()
  expect(selection.childTransport).toBeFunction()
  const events = []
  for await (const event of selection.chatTransport!({ token: "cli-session", provider: "codex", model: selection.model, messages: [{ role: "user", content: "Hello" }] })) events.push(event)
  expect(events).toContainEqual({ type: "text", content: "Codex answered." })
  expect(calls.some((call) => call.path.endsWith("/responses") && call.body?.model === "account-codex-model")).toBe(true)
})

test("catalog returns only public model metadata, never credentials", async () => {
  const catalog = await voiceModelCatalog(caller, "codex", new AbortController().signal)
  expect(catalog.providers.map((provider) => provider.id)).toEqual(["supercode", "codex", "openai"])
  expect(catalog.models).toEqual([{ id: "account-codex-model", label: "Account Codex Model", efforts: ["low", "high"], defaultEffort: "low" }])
  expect(JSON.stringify(catalog)).not.toContain("synthetic")
  expect(JSON.stringify(catalog)).not.toContain("encrypted")
})

test("suspended members cannot decrypt a connection or list its models", async () => {
  active = false
  await expect(prepareVoiceProvider(caller, { provider: "codex", model: "account-codex-model" }, new AbortController().signal)).rejects.toThrow("Active organization membership")
  await expect(voiceModelCatalog(caller, "codex", new AbortController().signal)).rejects.toThrow("Active organization membership")
  expect(vaultReads).toBe(0)
  expect(calls).toHaveLength(0)
})

test("disconnected accounts and unavailable models fail instead of changing providers", async () => {
  connected = false
  await expect(prepareVoiceProvider(caller, { provider: "codex", model: "account-codex-model" }, new AbortController().signal)).rejects.toThrow("Connect Codex")
  connected = true
  await expect(prepareVoiceProvider(caller, { provider: "codex", model: "missing-model" }, new AbortController().signal)).rejects.toThrow("unavailable")
  await expect(prepareVoiceProvider(caller, { provider: "codex", model: "account-codex-model", effort: "max" }, new AbortController().signal)).rejects.toThrow("reasoning effort")
})

test("other connected agents use their own transport and declared model catalog", async () => {
  const selection = await prepareVoiceProvider(caller, { provider: "openai", model: "private-model" }, new AbortController().signal)
  expect(selection.provider).toBe("openai")
  expect(selection.chatTransport).toBeFunction()
  await expect(prepareVoiceProvider(caller, { provider: "openai", model: "unknown" }, new AbortController().signal)).rejects.toThrow("available model")
  expect(calls).toHaveLength(0)
})

import type { CodexCredentialContext } from "@super/codex-runtime/credentials"
import type { CodexRow } from "@super/codex-runtime/service"
import type { NovaScope, NovaScopeStore } from "../lib/scope"
import { providerConnectionId } from "../lib/scope-store"

const connectedAt = new Date("2026-11-21T00:00:00Z")

export const fixtureScope = (user = "one"): NovaScope => ({
  organizationId: `org_${user}`, userId: `user_${user}`, membershipId: `member_${user}`,
  novaSessionId: `session_${user}`, provider: "codex", model: "fixture-model", effort: "medium",
  connectionId: providerConnectionId(`member_${user}`, "codex", connectedAt.toISOString()),
})

export function codexFixture(scope = fixtureScope()) {
  const requests: Array<{ body: Record<string, any>; authorization: string | null }> = []
  const state = { active: true, rotations: 0, responseAttempts: 0, requireRotation: false }
  const binding = JSON.stringify([scope.organizationId, scope.userId, scope.membershipId, "credentials"])
  let row: CodexRow = {
    membershipId: scope.membershipId, state: "connected", version: 1,
    encryptedCredentials: JSON.stringify({ access_token: `synthetic-access-${scope.userId}`, refresh_token: `synthetic-refresh-${scope.userId}`, id_token: "synthetic-id" }),
    attemptId: null, encryptedAttempt: null, sessionHash: null, intervalSeconds: 5,
    expiresAt: null, nextPollAt: null, lastStartedAt: null, connectedAt,
  }
  const scopeStore: NovaScopeStore = { async findSession(id) {
    if (id !== scope.novaSessionId) return null
    return { id, organizationId: scope.organizationId, initiatorMembership: {
      id: scope.membershipId, userId: scope.userId, organizationId: scope.organizationId, status: state.active ? "active" : "suspended",
    } }
  }, async findConnection() {
    if (!row.connectedAt) return null
    return {
      connectionId: providerConnectionId(scope.membershipId, "codex", row.connectedAt.toISOString()),
      provider: "codex", membershipId: scope.membershipId, userId: scope.userId,
      organizationId: scope.organizationId, status: row.state, enabled: row.state === "connected",
    }
  } }
  const context: CodexCredentialContext = {
    owner: { userId: scope.userId, organizationId: scope.organizationId, membershipId: scope.membershipId, sessionId: scope.novaSessionId },
    store: {
      async get() { return { ...row } },
      async compareAndSwap(version, patch) {
        if (row.version !== version) return false
        row = { ...row, ...patch, version: version + 1 }
        return true
      },
    },
    vault: () => ({
      open(value, actualBinding) {
        if (actualBinding !== binding) throw new Error("Wrong credential binding")
        return JSON.parse(value)
      },
      seal(value, actualBinding) {
        if (actualBinding !== binding) throw new Error("Wrong credential binding")
        return JSON.stringify(value)
      },
    }),
  }
  const reasoning = { type: "reasoning", id: `reason_${scope.userId}`, encrypted_content: `synthetic-encrypted-${scope.userId}` }
  const fetcher = (async (url, options) => {
    const path = new URL(String(url)).pathname
    if (path.endsWith("/models")) return Response.json({ models: [{
      slug: scope.model, display_name: "Fixture", supported_reasoning_levels: [{ effort: "medium" }], default_reasoning_level: "medium",
    }] })
    if (path.endsWith("/oauth/token")) {
      state.rotations++
      return Response.json({ access_token: `synthetic-rotated-${scope.userId}` })
    }
    state.responseAttempts++
    if (state.requireRotation && state.responseAttempts === 1) return new Response(null, { status: 401 })
    const body = JSON.parse(String(options?.body))
    requests.push({ body, authorization: new Headers(options?.headers).get("authorization") })
    const results = body.input.filter((item: any) => item.type === "function_call_output")
    if (results.length && !body.input.some((item: any) => item.encrypted_content === reasoning.encrypted_content)) throw new Error("Native reasoning was lost")
    const reply = `Runtime verified: ${results[0]?.output ?? ""}`
    const output = results.length
      ? [{ type: "message", role: "assistant", content: [{ type: "output_text", text: reply }] }]
      : [reasoning, { type: "function_call", id: `item_${scope.userId}`, call_id: `call_${scope.userId}`, name: "runtime_info", arguments: "{}" }]
    const frames = [
      ...(results.length ? [{ type: "response.output_text.delta", delta: reply }] : []),
      { type: "response.completed", response: { status: "completed", output, usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13 } } },
    ]
    return new Response(frames.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream" } })
  }) as typeof fetch
  return { scope, scopeStore, context, fetcher, requests, state, env: { NOVA_EVE_ENABLED: "true" } }
}

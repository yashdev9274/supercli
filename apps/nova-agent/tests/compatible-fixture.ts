import type { NovaScope, NovaScopeStore } from "../lib/scope"
import type { IntegrationId } from "@super/agent-runtime/integrations"
import type { StoredProviderConfig } from "@super/provider-runtime/config"

export function compatibleFixture(provider: IntegrationId = "openai") {
  const scope: NovaScope = { organizationId: "org_one", userId: "user_one", membershipId: "member_one", novaSessionId: "session_one", provider, connectionId: "connection_one", model: "fixture-model" }
  const state = { active: true, enabled: true, connectionId: scope.connectionId }
  const config: StoredProviderConfig = { apiKey: "synthetic-compatible-key", apiFamily: "openai", models: [{ id: scope.model, label: "Fixture" }] }
  const requests: Array<{ body: any; authorization: string | null; url: string; redirect: unknown }> = []
  const scopeStore: NovaScopeStore = {
    findSession: async () => ({ id: scope.novaSessionId, organizationId: scope.organizationId, initiatorMembership: { id: scope.membershipId, userId: scope.userId, organizationId: scope.organizationId, status: state.active ? "active" : "suspended" } }),
    findConnection: async () => ({ ...scope, connectionId: state.connectionId, status: "connected", enabled: state.enabled }),
  }
  const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`
  const response = (messages: any[]) => {
    const toolResult = messages.find((message) => message.role === "tool")
    const delta = (value: unknown, finish_reason: string | null = null) => frame({ id: "synthetic-response", created: 1, model: scope.model, choices: [{ index: 0, delta: value, finish_reason }] })
    return (toolResult
      ? delta({ role: "assistant", content: `Verified 👋 ${toolResult.content}` }) + delta({}, "stop")
      : delta({ role: "assistant", tool_calls: [{ index: 0, id: "call_one", type: "function", function: { name: "runtime_info", arguments: "{" } }] })
        + delta({ tool_calls: [{ index: 0, function: { arguments: "}" } }] }) + delta({}, "tool_calls"))
      + frame({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 3, total_tokens: 13 } }) + "data: [DONE]\n\n"
  }
  const fetcher = (async (url, init) => {
    const body = JSON.parse(String(init?.body))
    requests.push({ body, authorization: new Headers(init?.headers).get("authorization"), url: String(url), redirect: init?.redirect })
    const bytes = new TextEncoder().encode(response(body.messages))
    return new Response(new ReadableStream({ start(controller) {
      for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7))
      controller.close()
    } }), { headers: { "Content-Type": "text/event-stream" } })
  }) as typeof fetch
  return { scope, state, config, scopeStore, requests, fetcher, response, env: { NOVA_EVE_ENABLED: "true" } }
}

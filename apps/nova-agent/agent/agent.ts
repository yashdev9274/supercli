import { defineAgent, defineDynamic } from "eve"
import { integrationFor } from "@super/agent-runtime/integrations"

import { novaAgentPolicy } from "../lib/agent"
import { createTenantCodexModel } from "../lib/codex-selection"
import { createTenantOpenAICompatibleModel, createTenantAnthropicModel } from "../lib/provider-selection"
import { scopeFromPrincipal } from "../lib/scope"

export default defineAgent({
  ...novaAgentPolicy,
  model: defineDynamic((ctx) => {
    const principal = ctx.session.auth.current
    const scope = scopeFromPrincipal(principal)
    if (scope) {
      const integration = integrationFor(scope.provider)
      if (integration.eveAdapter === "codex-contract-tested") return { model: createTenantCodexModel(scope), modelContextWindowTokens: 128_000 }
      if (integration.eveAdapter === "openai-compatible-contract-tested") return { model: createTenantOpenAICompatibleModel(scope), modelContextWindowTokens: 8192 }
      if (integration.eveAdapter === "anthropic-contract-tested") return { model: createTenantAnthropicModel(scope), modelContextWindowTokens: 8192 }
      throw new Error(`${scope.provider} is registered, but its Eve ${integration.kind} adapter is not implemented`)
    }
    if (principal?.authenticator === "http-basic" && principal.principalId === "nova-runtime") return "openai/gpt-5.4-mini"
    throw new Error("An authorized Nova scope or runtime operator is required")
  }),
})

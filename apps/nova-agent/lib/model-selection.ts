import { integrationFor } from "@super/agent-runtime/integrations"
import { createTenantCodexModel } from "./codex-selection"
import { createTenantOpenAICompatibleModel, createTenantAnthropicModel } from "./provider-selection"
import type { NovaScope } from "./scope"

export function selectTenantModel(scope: NovaScope) {
  const integration = integrationFor(scope.provider)
  if (integration.eveAdapter === "codex-contract-tested") return { model: createTenantCodexModel(scope), modelContextWindowTokens: 128_000 }
  if (integration.eveAdapter === "openai-compatible-contract-tested") return { model: createTenantOpenAICompatibleModel(scope), modelContextWindowTokens: 8192 }
  if (integration.eveAdapter === "anthropic-contract-tested") return { model: createTenantAnthropicModel(scope), modelContextWindowTokens: 8192 }
  throw new Error(`${scope.provider} is registered, but its Eve ${integration.kind} adapter is not implemented`)
}

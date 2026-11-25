import { integrationFor, isOpenAICompatibleIntegration } from "@super/agent-runtime/integrations"
import type { StoredProviderConfig } from "@super/provider-runtime/config"
import { readScopedProviderConfig } from "@super/provider-runtime/store"

import { createOpenAICompatibleModel } from "./openai-compatible-model"
import { createAnthropicModel } from "./anthropic-model"
import { authorizeNovaScope, type NovaScope, type NovaScopeStore } from "./scope"
import { createPrismaScopeStore } from "./scope-store"

function createTenantModel(inputScope: NovaScope, dependencies: {
  scopeStore?: NovaScopeStore
  readConfig?: (scope: NovaScope) => Promise<StoredProviderConfig>
  fetch?: typeof fetch
  env?: Record<string, string | undefined>
} = {}) {
  const scope = Object.freeze({ ...inputScope })
  const integration = integrationFor(scope.provider)
  if (integration.kind !== "model" || (!isOpenAICompatibleIntegration(scope.provider) && scope.provider !== "anthropic")) throw new Error("This integration requires a different model or agent adapter")
  const scopeStore = dependencies.scopeStore ?? createPrismaScopeStore()
  const create = scope.provider === "anthropic" ? createAnthropicModel : createOpenAICompatibleModel
  return create({
    scope: { ...scope }, fetch: dependencies.fetch,
    async authorize(signal) {
      signal?.throwIfAborted()
      if ((dependencies.env ?? process.env).NOVA_EVE_ENABLED !== "true" || !await authorizeNovaScope(scope, scopeStore)) throw new Error("Nova session or provider connection is no longer authorized")
      return (dependencies.readConfig ?? readScopedProviderConfig)(scope)
    },
  })
}

export function createTenantOpenAICompatibleModel(scope: NovaScope, dependencies?: Parameters<typeof createTenantModel>[1]) {
  if (!isOpenAICompatibleIntegration(scope.provider)) throw new Error("This integration requires a different model or agent adapter")
  return createTenantModel(scope, dependencies)
}

export function createTenantAnthropicModel(scope: NovaScope, dependencies?: Parameters<typeof createTenantModel>[1]) {
  if (scope.provider !== "anthropic") throw new Error("This integration requires an Anthropic-native adapter")
  return createTenantModel(scope, dependencies)
}

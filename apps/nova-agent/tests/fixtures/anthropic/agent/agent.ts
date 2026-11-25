import { defineAgent, defineDynamic } from "eve"
import { novaAgentPolicy } from "../../../../lib/agent"
import { createTenantAnthropicModel } from "../../../../lib/provider-selection"
import { scopeFromPrincipal } from "../../../../lib/scope"
import { fixture } from "../lib/fixture"

export default defineAgent({
  ...novaAgentPolicy,
  model: defineDynamic((ctx) => {
    const scope = scopeFromPrincipal(ctx.session.auth.current)
    if (!scope) throw new Error("Scoped fixture principal required")
    return {
      model: createTenantAnthropicModel(scope, { scopeStore: fixture.scopeStore, readConfig: async () => fixture.config, fetch: fixture.fetcher, env: fixture.env }),
      modelContextWindowTokens: 8192,
    }
  }),
})

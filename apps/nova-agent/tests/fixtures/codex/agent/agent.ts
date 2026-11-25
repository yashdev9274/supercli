import { defineAgent, defineDynamic } from "eve"
import { novaAgentPolicy } from "../../../../lib/agent"
import { createTenantCodexModel } from "../../../../lib/codex-selection"
import { scopeFromPrincipal } from "../../../../lib/scope"
import { fixtures } from "../lib/fixtures"

export default defineAgent({
  ...novaAgentPolicy,
  model: defineDynamic((ctx) => {
    const scope = scopeFromPrincipal(ctx.session.auth.current)
    const fixture = fixtures.find((entry) => entry.scope.novaSessionId === scope?.novaSessionId)
    if (!scope || !fixture) throw new Error("Scoped fixture principal required")
    return {
      model: createTenantCodexModel(scope, { scopeStore: fixture.scopeStore, context: async () => fixture.context, fetch: fixture.fetcher, env: fixture.env }),
      modelContextWindowTokens: 128_000,
    }
  }),
})

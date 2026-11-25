import { defineAgent, defineDynamic } from "eve"

import { novaAgentPolicy } from "../lib/agent"
import { selectTenantModel } from "../lib/model-selection"
import { scopeFromPrincipal } from "../lib/scope"

export default defineAgent({
  ...novaAgentPolicy,
  model: defineDynamic((ctx) => {
    const principal = ctx.session.auth.current
    const scope = scopeFromPrincipal(principal)
    if (scope) return selectTenantModel(scope)
    if (principal?.authenticator === "http-basic" && principal.principalId === "nova-runtime") return "openai/gpt-5.4-mini"
    throw new Error("An authorized Nova scope or runtime operator is required")
  }),
})

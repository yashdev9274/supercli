import { defineDynamic } from "eve/tools"
import { scopeFromPrincipal } from "../../../../lib/scope"
import { repositoryTools } from "../../../../lib/repository-tools"

export default defineDynamic((ctx) => {
  const scope = scopeFromPrincipal(ctx.session.auth.current)
  if (!scope?.repositoryRunId || !ctx.session.parent || process.env.NOVA_EVE_SPECIALISTS_ENABLED !== "true") return null
  return repositoryTools(scope, "implementer")
})

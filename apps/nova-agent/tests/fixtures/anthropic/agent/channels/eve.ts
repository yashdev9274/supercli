import { localDev } from "eve/channels/auth"
import { eveChannel } from "eve/channels/eve"
import { authenticateNovaScope } from "../../../../../lib/scope"
import { authorizeEveRequest } from "../../../../../lib/session-access"
import { fixture, env } from "../../lib/fixture"

export default eveChannel({
  auth: async (request) => {
    if (!request.headers.has("authorization")) return localDev()(request)
    const principal = await authenticateNovaScope(request, fixture.scopeStore, env)
    return principal && await authorizeEveRequest(request, principal) ? principal : null
  },
  uploadPolicy: "disabled", cors: false,
})

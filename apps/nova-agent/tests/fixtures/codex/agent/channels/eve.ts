import { localDev } from "eve/channels/auth"
import { eveChannel } from "eve/channels/eve"
import { authenticateNovaScope } from "../../../../../lib/scope"
import { env, scopeStore } from "../../lib/fixtures"
import { authorizeEveRequest } from "../../../../../lib/session-access"

export default eveChannel({
  auth: async (request) => {
    if (!request.headers.has("authorization")) return localDev()(request)
    const principal = await authenticateNovaScope(request, scopeStore, env)
    return principal && await authorizeEveRequest(request, principal) ? principal : null
  },
  uploadPolicy: "disabled",
  cors: false,
})

import { eveChannel } from "eve/channels/eve"

import { authenticateRuntime } from "../../lib/auth"
import { authenticateNovaScope } from "../../lib/scope"
import { createPrismaScopeStore } from "../../lib/scope-store"
import { authorizeEveRequest } from "../../lib/session-access"

export default eveChannel({
  auth: async (request) => {
    const principal = authenticateRuntime(request) ?? await authenticateNovaScope(request, createPrismaScopeStore())
    return principal && await authorizeEveRequest(request, principal) ? principal : null
  },
  uploadPolicy: "disabled",
  cors: false,
})

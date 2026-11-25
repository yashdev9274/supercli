import { localDev } from "eve/channels/auth"
import { eveChannel } from "eve/channels/eve"
import { scope } from "../../lib/scope"

export default eveChannel({ auth: async (request) => {
  const local = await localDev()(request)
  if (!local) return null
  return { ...local, allowAgentInfo: true, principalType: "user", authenticator: "nova-scope", issuer: "nova", attributes: scope }
}, uploadPolicy: "disabled", cors: false })

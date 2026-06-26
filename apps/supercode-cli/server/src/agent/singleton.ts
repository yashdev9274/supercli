import { DefaultAgentService } from "./agent-service"
import { registerBuiltInAgents } from "./built-in"

const agentService = new DefaultAgentService()
registerBuiltInAgents(agentService)

export { agentService }

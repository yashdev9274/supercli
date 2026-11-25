import { defineAgent, type AgentStaticModelDefinition, type SessionUsageLimit } from "eve"

export const novaAgentPolicy = {
  defaultTools: false,
  tool: false,
  limits: {
    sessionUsage: (({ window }) => window.inputTokens + window.outputTokens >= 100_000) satisfies SessionUsageLimit,
  },
} as const

export function createNovaAgent(model: AgentStaticModelDefinition) {
  return defineAgent({ model, ...novaAgentPolicy })
}

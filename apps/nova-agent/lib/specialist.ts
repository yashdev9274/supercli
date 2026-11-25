import { defineAgent, defineDynamic, type AgentStaticModelDefinition } from "eve"
import { novaAgentPolicy } from "./agent"
import { selectTenantModel } from "./model-selection"
import { scopeFromPrincipal, type NovaScope } from "./scope"
import type { SpecialistRole } from "@super/nova-runtime/specialists"

const descriptions: Record<SpecialistRole, string> = {
  explorer: "Read-only repository investigator. Return file/version evidence, relevant conventions and a bounded implementation brief. No edits or commands.",
  implementer: "Read-only implementation specialist. Propose precise edits with paths and expected file versions for parent review; cannot apply them or run commands.",
  verifier: "Read-only independent reviewer. Inspect the implementation for defects and missing tests; report evidence. Only the parent can run authorized validation and finalize.",
}

export function specialistAgent(role: SpecialistRole, select: (scope: NovaScope) => { model: AgentStaticModelDefinition; modelContextWindowTokens: number } = selectTenantModel) {
  return defineAgent({
      ...novaAgentPolicy,
      description: descriptions[role],
      tool: false,
      limits: { sessionUsage: ({ window }) => window.inputTokens + window.outputTokens >= 30_000 },
      model: defineDynamic((child) => {
        const current = scopeFromPrincipal(child.session.auth.current)
        if (!current?.repositoryRunId || !child.session.parent || process.env.NOVA_EVE_SPECIALISTS_ENABLED !== "true" || process.env.NOVA_EVE_REPOSITORY_ENABLED !== "true") throw new Error("An authorized specialist child context is required")
        return select(current)
      }),
  })
}

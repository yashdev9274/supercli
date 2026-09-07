import type { RulesetArray } from "src/permission"
import { agentService } from "../service.ts"

/**
 * Merge a parent agent's ruleset with a child agent's ruleset so that
 * the parent's DENY rules always take precedence over the child's ALLOW.
 */
export function mergeParentChildPermissions(
  childRules: RulesetArray | undefined,
  parentRules: RulesetArray | undefined,
): RulesetArray {
  const merged: RulesetArray = [...(childRules ?? []), ...(parentRules ?? [])]

  if (parentRules) {
    for (const rule of parentRules) {
      if (rule.action === "deny") {
        merged.push(rule)
      }
    }
  }

  return merged
}

export function resolveAgentRuleset(
  agentName: string | undefined,
  parentAgentName: string | undefined,
): RulesetArray | undefined {
  if (!agentName) return undefined

  const childRules = agentService.get(agentName)?.info.permission

  if (parentAgentName) {
    const parentRules = agentService.get(parentAgentName)?.info.permission
    if (parentRules) {
      return mergeParentChildPermissions(childRules, parentRules)
    }
  }

  return childRules
}

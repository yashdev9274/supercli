import type { RulesetArray } from "src/permission"
import { agentService } from "src/agent"

/**
 * Merge a parent agent's ruleset with a child agent's ruleset so that
 * the parent's DENY rules always take precedence over the child's ALLOW.
 *
 * Without this, a restricted parent (e.g. "reviewer" with deny-write)
 * could spawn a "general" subagent that ignores the parent's restrictions.
 *
 * Merge strategy:
 *   1. Child rules come first (base capabilities)
 *   2. Parent rules come AFTER (overrides — parent narrows the child)
 *   3. Within each, DENY rules are also re-inserted at the very end
 *      as a safety net so a broad ALLOW in the child can't bypass a
 *      specific DENY in the parent.
 *
 * This is a strict "parent-can-always-narrow" policy. The child never
 * expands what the parent allows.
 */
export function mergeParentChildPermissions(
  childRules: RulesetArray | undefined,
  parentRules: RulesetArray | undefined,
): RulesetArray {
  const merged: RulesetArray = [
    ...(childRules ?? []),
    ...(parentRules ?? []),
  ]

  // Re-append the parent's DENY rules at the very end so they always
  // win via findLastMatch (later rules override earlier ones).
  if (parentRules) {
    for (const rule of parentRules) {
      if (rule.action === "deny") {
        merged.push(rule)
      }
    }
  }

  return merged
}

/**
 * Resolve the full permission ruleset for an agent, including parent
 * inheritance. If the agent is running as a subagent of another agent,
 * the parent's rules are merged per mergeParentChildPermissions.
 */
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

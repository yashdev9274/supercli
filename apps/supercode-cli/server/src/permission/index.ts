export type PermissionEffect = "deny" | "ask" | "allow"

export interface Ruleset {
  permission: string
  pattern: string
  action: PermissionEffect
  reason?: string
}

export type RulesetArray = Ruleset[]

export interface SessionPermission {
  deny: RulesetArray
  allow: RulesetArray
  ask: RulesetArray
  rules: RulesetArray
}

export function mergePermissions(...rulesets: RulesetArray[]): RulesetArray {
  return rulesets.flat()
}

export function permissionFromConfig(
  config: Record<string, string | Record<string, string>>,
): RulesetArray {
  const rules: RulesetArray = []
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "string") {
      rules.push({
        permission: key,
        pattern: "*",
        action: value as PermissionEffect,
      })
    } else {
      for (const [pattern, action] of Object.entries(value)) {
        rules.push({
          permission: key,
          pattern,
          action: action as PermissionEffect,
        })
      }
    }
  }
  return rules
}

export function wildcardMatch(input: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp("^" + escaped + "$", "s").test(input)
}

export type EnforcementAction = "warn" | "truncate" | "block"

/**
 * Enforces a plan's context-length limit (16K grandfathered, 32K Premium,
 * 128K Pro, 1M Ultra). Defaults to truncation.
 */
export function enforceContextLimit(
  totalTokens: number,
  contextLimit: number,
  action: EnforcementAction = "truncate",
): {
  allowed: boolean
  truncatedTokens?: number
  message?: string
} {
  if (totalTokens <= contextLimit) {
    return { allowed: true }
  }

  if (action === "warn") {
    return {
      allowed: true,
      message: `Warning: context (${totalTokens.toLocaleString()} tokens) exceeds your plan limit of ${contextLimit.toLocaleString()}. Run /upgrade.`,
    }
  }

  if (action === "truncate") {
    return {
      allowed: true,
      truncatedTokens: contextLimit,
      message: `Context truncated to ${contextLimit.toLocaleString()} tokens (plan limit).`,
    }
  }

  return {
    allowed: false,
    message: `Context of ${totalTokens.toLocaleString()} tokens exceeds your plan limit of ${contextLimit.toLocaleString()}. Run /upgrade.`,
  }
}

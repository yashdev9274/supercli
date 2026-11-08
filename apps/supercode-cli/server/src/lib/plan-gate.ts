import { getSubscriptionPlan } from "./subscription-check"
import { isModelAllowedForTier, getUpgradeSuggestion } from "./model-access"
import { checkRequestLimit } from "./request-counter"
import { enforceContextLimit } from "./context-enforcer"

export interface PlanGateResult {
  allowed: boolean
  message?: string
  plan?: {
    tier: string
    name: string
    requestLimit: number
    contextLimit: number
    creditAmountCents: number
    monthlyCredits: number
    isGrandfathered: boolean
  }
}

export async function checkPlanGate(
  userId: string,
  modelName: string,
  opts?: { totalTokens?: number; nativeDeepSeek?: boolean },
): Promise<PlanGateResult> {
  const plan = await getSubscriptionPlan(userId)
  if (!plan) {
    return {
      allowed: false,
      message: "Unable to verify your plan right now. Retry in a moment, or run /upgrade if this persists.",
    }
  }

  const request = await checkRequestLimit(userId, plan.requestLimit)
  if (!request.allowed) return { allowed: false, message: request.message }

  const modelAllowed = await isModelAllowedForTier(modelName, plan.tier)
  if (!modelAllowed) {
    return {
      allowed: false,
      message: `"${modelName}" is not available on your ${plan.name} plan. ${getUpgradeSuggestion(plan.tier)}`,
    }
  }

  const contextLimit = opts?.nativeDeepSeek === true &&
    (modelName === "deepseek-v4-flash" || modelName === "deepseek/deepseek-v4-flash")
    ? 1_048_576
    : plan.contextLimit
  if (opts?.totalTokens !== undefined) {
    if (!Number.isFinite(opts.totalTokens) || opts.totalTokens < 0) {
      return { allowed: false, message: "Invalid context token count." }
    }
    const context = enforceContextLimit(opts.totalTokens, contextLimit, "block")
    if (!context.allowed) return { allowed: false, message: context.message }
  }

  return {
    allowed: true,
    plan: {
      tier: plan.tier,
      name: plan.name,
      requestLimit: plan.requestLimit,
      contextLimit,
      creditAmountCents: plan.creditAmountCents,
      monthlyCredits: plan.monthlyCredits,
      isGrandfathered: plan.isGrandfathered,
    },
  }
}

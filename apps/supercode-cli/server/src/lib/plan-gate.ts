import { getSubscriptionPlan } from "./subscription-check"
import { isModelAllowedForTier, getUpgradeSuggestion } from "./model-access"
import { checkRequestLimit } from "./request-counter"
import { deductCredits } from "./credit-meter"
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
    isGrandfathered: boolean
  }
  credits?: { deducted: boolean; remainingCents: number }
}

/**
 * Enforcement gate run before each AI request:
 *   1. Read the user's plan from the CLI server DB (no API call)
 *   2. Check the monthly request cap (10K / 15K / 25K / 110K)
 *   3. Check the model is allowed on the user's tier
 *   4. Check context length ≤ tier limit (16K / 32K / 128K / 1M)
 *   5. Deduct credits at the model's burn rate (soft gate — falls back to quota)
 */
export async function checkPlanGate(
  userId: string,
  modelName: string,
  opts?: { totalTokens?: number },
): Promise<PlanGateResult> {
  const plan = await getSubscriptionPlan(userId)

if (!plan) {
    // getSubscriptionPlan now auto-provisions Spark; this path is only hit if
    // both DB and fail-open fallbacks are unavailable.
    return {
      allowed: false,
      message:
        "Unable to verify your plan right now. Retry in a moment, or run /upgrade if this persists.",
    }
  }

  // 2. Request cap — hard gate
  const request = await checkRequestLimit(userId, plan.requestLimit)
  if (!request.allowed) {
    return { allowed: false, message: request.message }
  }

  // 3. Model gating — hard gate
  const modelAllowed = await isModelAllowedForTier(modelName, plan.tier)
  if (!modelAllowed) {
    const suggestion = getUpgradeSuggestion(plan.tier)
    return {
      allowed: false,
      message: `"${modelName}" is not available on your ${plan.name} plan. ${suggestion}`,
    }
  }

  // 4. Context enforcement — truncate above plan limit
  if (opts?.totalTokens) {
    const ctx = enforceContextLimit(opts.totalTokens, plan.contextLimit)
    if (!ctx.allowed) {
      return { allowed: false, message: ctx.message }
    }
  }

  // 5. Credits — soft gate (deduct if available, fall back to quota otherwise)
  const credits = await deductCredits(userId, modelName)

  return {
    allowed: true,
    plan: {
      tier: plan.tier,
      name: plan.name,
      requestLimit: plan.requestLimit,
      contextLimit: plan.contextLimit,
      creditAmountCents: plan.creditAmountCents,
      isGrandfathered: plan.isGrandfathered,
    },
    credits,
  }
}

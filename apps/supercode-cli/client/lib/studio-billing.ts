export function studioBillingHeaders(token: string | undefined): Record<string, string> {
  if (!token) throw new Error("Your session has expired. Please sign in again.")
  return { Authorization: `Bearer ${token}` }
}

export type ProductCreditBalance = {
  balanceCredits: number
  allowanceCredits: number
  resetAt: string | null
}

export function creditsLabel(plan: { tier: string; variant?: string | null; creditAmountCents: number } | null | undefined): string {
  if (!plan) return "—"
  if (plan.tier === "free") return "Fixed DeepSeek"
  if (plan.tier === "spark") return "$5 / mo"
  if (plan.tier === "pro") return plan.variant === "in" ? "$20 / mo" : "$25 / mo"
  if (plan.tier === "ultra") return "$110 / mo"
  return plan.creditAmountCents ? `$${plan.creditAmountCents / 100} / mo` : "—"
}

export function creditPercentage(balance: ProductCreditBalance): number {
  if (balance.allowanceCredits <= 0) return 0
  return Math.max(0, Math.min(100, Math.round(balance.balanceCredits / balance.allowanceCredits * 100)))
}

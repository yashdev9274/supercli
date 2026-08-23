import prisma from "./prisma"

// Base credit cost per request in cents (matches the "Credit Burn Rates" table in the DDP plan)
const MODEL_BASE_COST: Record<string, number> = {
  "deepseek-v4-flash": 1.0, // $0.01
  "deepseek/deepseek-v4-flash": 1.0,
  "MiniMax-M3": 1.5, // $0.015
  "minimax/minimax-m3": 1.5,
  "mimo-v2.5": 5.0, // $0.05
  "stealth/ox-alpha": 0.0, // free
  "kimi-k2-6": 0.5, // $0.005 (other open models)
  "kimi-k2-7-code": 0.5,
  "kimi-k3": 0.5,
  "glm-5.2": 0.5,
  "glm-5.1": 0.5,
  "gemini-2.5-flash": 0.5,
  "hy3": 0.5,
  "fireworks/nemotron-3-ultra-nvfp4": 0.5,
}

// Deal multipliers — stretch credits further on select models
const MODEL_DEAL_MULTIPLIER: Record<string, number> = {
  "deepseek-v4-flash": 4.0, // 4× = 75% less credit burn
  "deepseek/deepseek-v4-flash": 4.0,
  "MiniMax-M3": 2.7,
  "minimax/minimax-m3": 2.7,
  "mimo-v2.5": 100.0, // 99% off
}

/** Effective credit cost in cents for a model (base ÷ deal multiplier). */
export function getCreditCost(model: string): number {
  const base = MODEL_BASE_COST[model] ?? 1.0
  const deal = MODEL_DEAL_MULTIPLIER[model] ?? 1.0
  return Math.round((base / deal) * 100) / 100
}

/**
 * Deducts credits for a request. Credits are a soft gate — if the balance is
 * too low the request proceeds on the request-limit quota instead.
 */
export async function deductCredits(
  userId: string,
  model: string,
): Promise<{ deducted: boolean; remainingCents: number }> {
  try {
    const cost = getCreditCost(model)

    const balance = await prisma.creditBalance.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
    })

    if (!balance || balance.balanceCents < cost) {
      return { deducted: false, remainingCents: balance?.balanceCents ?? 0 }
    }

    await prisma.creditBalance.update({
      where: { userId_planId: { userId: balance.userId, planId: balance.planId } },
      data: { balanceCents: { decrement: cost } },
    })

    return { deducted: true, remainingCents: balance.balanceCents - cost }
  } catch (error) {
    console.error("[credit-meter] Failed to deduct credits:", error)
    return { deducted: false, remainingCents: 0 }
  }
}

export async function getCreditBalance(
  userId: string,
): Promise<{ balanceCents: number; totalCredits: number; resetAt: Date | null } | null> {
  try {
    const balance = await prisma.creditBalance.findFirst({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      select: { balanceCents: true, totalCredits: true, resetAt: true },
    })
    return balance ?? null
  } catch (error) {
    console.error("[credit-meter] Failed to fetch credit balance:", error)
    return null
  }
}

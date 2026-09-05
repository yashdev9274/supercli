import type { BillingPlan, GetBillingPlansResponse } from "../vercel/schemas"

function hostBase(): string {
  return (process.env.HOST || "http://localhost:3010").replace(/\/$/, "")
}

function productSlug(): string {
  return process.env.MARKETPLACE_PRODUCT_SLUG || "supercode-review"
}

function policies(): BillingPlan["requiredPolicies"] {
  const h = hostBase()
  return [
    {
      id: "tos",
      name: "Supercode Terms of Service",
      url: `${h}/terms`,
    },
    {
      id: "privacy",
      name: "Supercode Privacy Policy",
      url: `${h}/privacy`,
    },
  ]
}

/** Plans for the Supercode Review Marketplace product (AI PR review). */
export function getSupercodeReviewPlans(): BillingPlan[] {
  const requiredPolicies = policies()
  return [
    {
      id: "free",
      type: "subscription",
      name: "Free",
      description:
        "Try Supercode Review on public repos — limited PR reviews / month",
      scope: "resource",
      paymentMethodRequired: false,
      cost: "$0",
      highlightedDetails: [
        { label: "AI PR reviews", value: "25 / month" },
        { label: "GitHub App", value: "Included" },
      ],
      details: [
        { label: "Inline comments + summary" },
        { label: "Security & bug detection" },
        { label: "Community support" },
      ],
      requiredPolicies,
    },
    {
      id: "pro",
      type: "subscription",
      name: "Pro",
      description: "Unlimited AI code review for growing teams",
      scope: "resource",
      paymentMethodRequired: true,
      cost: "$20/month per seat",
      preauthorizationAmount: 20,
      highlightedDetails: [
        { label: "AI PR reviews", value: "Unlimited" },
        { label: "Private repos" },
        { label: "Priority queue" },
      ],
      details: [
        { label: "Custom review rules" },
        { label: "Slack / Linear integrations" },
        { label: "Email support" },
      ],
      requiredPolicies,
    },
    {
      id: "team",
      type: "subscription",
      name: "Team",
      description: "Org-wide review policies and advanced analytics",
      scope: "resource",
      paymentMethodRequired: true,
      cost: "$30/month per seat",
      preauthorizationAmount: 30,
      highlightedDetails: [
        { label: "Everything in Pro" },
        { label: "Org policies" },
        { label: "Insights dashboard" },
      ],
      details: [
        { label: "SSO-ready onboarding" },
        { label: "Dedicated support" },
      ],
      requiredPolicies,
    },
  ]
}

/** @deprecated prefer getSupercodeReviewPlans() — kept for simple imports */
export const SUPERCODE_REVIEW_PLANS = getSupercodeReviewPlans()

export function getPlanById(planId: string): BillingPlan | undefined {
  return getSupercodeReviewPlans().find((p) => p.id === planId)
}

export function getProductBillingPlans(
  productId: string,
): GetBillingPlansResponse {
  const slug = productId || productSlug()
  if (slug !== productSlug() && slug !== "supercode-review") {
    return { plans: [] }
  }
  return { plans: getSupercodeReviewPlans() }
}

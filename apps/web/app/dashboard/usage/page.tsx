import { BillingDashboard } from "@/components/dashboard/usage/billing-dashboard"
import { requireAuth } from "@/modules/components/utils/auth-utils"

export const dynamic = "force-dynamic"

export default async function BillingPage() {
  await requireAuth()
  return <BillingDashboard />
}

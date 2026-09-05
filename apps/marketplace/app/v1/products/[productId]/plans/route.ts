import { getProductBillingPlans } from "@/lib/partner"
import { withAuth } from "@/lib/vercel/auth"

export const dynamic = "force-dynamic"

export const GET = withAuth(async (_claims, _request, context) => {
  const { productId } = await context.params
  const response = getProductBillingPlans(productId)
  return Response.json(response)
})

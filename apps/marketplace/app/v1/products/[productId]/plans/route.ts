import { getProductBillingPlans } from "@/lib/partner"
import { withAuth } from "@/lib/vercel/auth"

export const dynamic = "force-dynamic"

async function resolveParams(
  params: Promise<Record<string, string>> | Record<string, string>,
) {
  return params instanceof Promise ? await params : params
}

export const GET = withAuth(async (_claims, _request, context) => {
  const params = await resolveParams(context.params)
  const response = getProductBillingPlans(params.productId!)
  return Response.json(response)
})

import {
  getInstallation,
  getPlanById,
  installIntegration,
  uninstallInstallation,
  updateInstallation,
  SUPERCODE_REVIEW_PLANS,
} from "@/lib/partner"
import { readRequestBodyWithSchema } from "@/lib/utils"
import { withAuth } from "@/lib/vercel/auth"
import {
  type InstallationResponse,
  installIntegrationRequestSchema,
  updateInstallationRequestSchema,
} from "@/lib/vercel/schemas"

export const dynamic = "force-dynamic"

export const PUT = withAuth(async (claims, request) => {
  const requestBody = await readRequestBodyWithSchema(
    request,
    installIntegrationRequestSchema,
  )

  if (!requestBody.success) {
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: "Invalid install payload",
        },
      },
      { status: 400 },
    )
  }

  await installIntegration(claims.installation_id, claims, requestBody.data)

  const plan = SUPERCODE_REVIEW_PLANS[0]!
  return Response.json(
    {
      billingPlan: { ...plan, scope: "installation" as const },
      notification: {
        level: "info" as const,
        title: "Supercode Review installed",
        message: "Provision the Supercode Review product, then connect GitHub.",
      },
    } satisfies InstallationResponse,
    { status: 200 },
  )
})

export const DELETE = withAuth(async (claims) => {
  const response = await uninstallInstallation(claims.installation_id)
  return Response.json(response)
})

export const GET = withAuth(async (claims) => {
  const installation = await getInstallation(claims.installation_id)
  if (!installation || installation.deletedAt) {
    return new Response(null, { status: 404 })
  }

  const billingPlan =
    getPlanById(installation.billingPlanId) ?? SUPERCODE_REVIEW_PLANS[0]

  return Response.json({
    billingPlan: billingPlan
      ? { ...billingPlan, scope: "installation" as const }
      : undefined,
    notification: installation.notification as InstallationResponse["notification"],
  } satisfies InstallationResponse)
})

export const PATCH = withAuth(async (claims, request) => {
  const requestBody = await readRequestBodyWithSchema(
    request,
    updateInstallationRequestSchema,
  )

  if (!requestBody.success) {
    return new Response(null, { status: 400 })
  }

  await updateInstallation(
    claims.installation_id,
    requestBody.data.billingPlanId,
  )

  return new Response(null, { status: 204 })
})

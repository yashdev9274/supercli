import { listResources, provisionResource } from "@/lib/partner"
import { readRequestBodyWithSchema } from "@/lib/utils"
import { withAuth } from "@/lib/vercel/auth"
import { provisionResourceRequestSchema } from "@/lib/vercel/schemas"

export const dynamic = "force-dynamic"

export const GET = withAuth(async (claims, request) => {
  const ids = request.nextUrl.searchParams.getAll("ids")
  const resources = await listResources(
    claims.installation_id,
    ids.length ? ids : undefined,
  )
  return Response.json(resources)
})

export const POST = withAuth(async (claims, request) => {
  const requestBody = await readRequestBodyWithSchema(
    request,
    provisionResourceRequestSchema,
  )

  if (!requestBody.success) {
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: "Invalid provision payload",
        },
      },
      { status: 400 },
    )
  }

  try {
    const resource = await provisionResource(
      claims.installation_id,
      requestBody.data,
    )
    return Response.json(resource, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provision failed"
    const status = message.includes("not found") ? 404 : 500
    return Response.json(
      {
        error: {
          code: status === 404 ? "not_found" : "internal_error",
          message,
        },
      },
      { status },
    )
  }
})

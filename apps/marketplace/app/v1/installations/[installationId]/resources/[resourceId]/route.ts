import {
  deleteResource,
  getResource,
  updateResource,
} from "@/lib/partner"
import { readRequestBodyWithSchema } from "@/lib/utils"
import { withAuth } from "@/lib/vercel/auth"
import { updateResourceRequestSchema } from "@/lib/vercel/schemas"

export const dynamic = "force-dynamic"

export const GET = withAuth(async (claims, _request, context) => {
  const { resourceId } = await context.params
  const resource = await getResource(claims.installation_id, resourceId)

  if (!resource) {
    return Response.json(
      { error: true, code: "not_found" },
      { status: 404 },
    )
  }

  return Response.json(resource)
})

export const PATCH = withAuth(async (claims, request, context) => {
  const { resourceId } = await context.params
  const requestBody = await readRequestBodyWithSchema(
    request,
    updateResourceRequestSchema,
  )

  if (!requestBody.success) {
    return new Response(null, { status: 400 })
  }

  try {
    const updated = await updateResource(
      claims.installation_id,
      resourceId,
      requestBody.data,
    )
    return Response.json(updated, { status: 200 })
  } catch {
    return Response.json(
      { error: true, code: "not_found" },
      { status: 404 },
    )
  }
})

export const DELETE = withAuth(async (claims, _request, context) => {
  const { resourceId } = await context.params
  await deleteResource(claims.installation_id, resourceId)
  return new Response(null, { status: 204 })
})

import { z } from "zod"

import { requestHarnessComposio, withHarnessComposio } from "@/modules/nova/harness/composio"

const bodySchema = z.object({
  slug: z.string().trim().min(1).max(64),
})

export const runtime = "nodejs"

export async function POST(request: Request) {
  return withHarnessComposio(request, async (token) => {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      throw Object.assign(new Error("A toolkit slug is required"), { statusCode: 400 })
    }
    return requestHarnessComposio("connect", token, { ...parsed.data, returnTo: "nova" })
  })
}

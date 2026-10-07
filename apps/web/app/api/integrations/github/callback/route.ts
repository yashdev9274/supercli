import { handleComposioCallback } from "@/modules/integrations/lib/callback-flow"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const url = new URL(request.url)
  return handleComposioCallback({
    provider: "github",
    searchParams: url.searchParams,
    requestOrigin: url.origin,
  })
}

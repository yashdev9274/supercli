import { handleComposioCallback } from "@/modules/integrations/lib/callback-flow"

export async function GET(request: Request) {
  return handleComposioCallback({
    provider: "github",
    searchParams: new URL(request.url).searchParams,
  })
}

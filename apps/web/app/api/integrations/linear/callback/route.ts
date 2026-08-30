import { NextRequest } from "next/server"
import { handleComposioCallback } from "@/modules/integrations/lib/callback-flow"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return handleComposioCallback({
    provider: "linear",
    searchParams: request.nextUrl.searchParams,
  })
}

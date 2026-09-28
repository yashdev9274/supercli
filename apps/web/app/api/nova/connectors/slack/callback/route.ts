import { NextRequest } from "next/server"

import { handleNativeConnectorCallback } from "@/modules/nova/connectors/callback"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  return handleNativeConnectorCallback("slack", request.nextUrl.searchParams)
}

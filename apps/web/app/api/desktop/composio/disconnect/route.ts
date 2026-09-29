import { NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { disconnectDesktopComposio } from "@/modules/integrations/lib/desktop-composio"

export async function POST(request: Request) {
  const user = await getDesktopReviewUser(request.headers.get("authorization"))
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as { connectedAccountId?: unknown } | null
  if (typeof body?.connectedAccountId !== "string") {
    return NextResponse.json({ error: "A connected account ID is required" }, { status: 400 })
  }
  await disconnectDesktopComposio(user.id, body.connectedAccountId)
  return NextResponse.json({ success: true })
}

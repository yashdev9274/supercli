import { NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { beginDesktopComposioConnect } from "@/modules/integrations/lib/desktop-composio"

export async function POST(request: Request) {
  const user = await getDesktopReviewUser(request.headers.get("authorization"))
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as { slug?: unknown } | null
  if (typeof body?.slug !== "string") {
    return NextResponse.json({ error: "A toolkit slug is required" }, { status: 400 })
  }
  const result = await beginDesktopComposioConnect(user.id, body.slug)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({
    connectedAccountId: result.connectionRequestId,
    redirectUrl: result.redirectUrl,
  })
}

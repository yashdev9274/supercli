import { NextRequest, NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { getAgentSession } from "@/modules/nova/sessions/service"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getDesktopReviewUser(request.headers.get("authorization"))
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { sessionId } = await context.params
    const session = await getAgentSession(user.id, sessionId)
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    return NextResponse.json({ session })
  } catch (error) {
    console.error("[api/desktop/nova/sessions/:sessionId]", error)
    return NextResponse.json({ error: "Failed to load Nova session" }, { status: 500 })
  }
}

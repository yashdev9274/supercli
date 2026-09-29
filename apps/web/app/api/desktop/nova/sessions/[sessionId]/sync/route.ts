import { NextRequest, NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { syncAgentSession } from "@/modules/nova/sessions/service"

function nonnegativeInteger(value: string | null, fallback: number): number | null {
  if (value === null) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getDesktopReviewUser(request.headers.get("authorization"))
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const afterSequence = nonnegativeInteger(request.nextUrl.searchParams.get("after"), 0)
    const limit = nonnegativeInteger(request.nextUrl.searchParams.get("limit"), 100)
    if (afterSequence === null || limit === null || limit === 0) {
      return NextResponse.json({ error: "Invalid sync cursor" }, { status: 400 })
    }
    const { sessionId } = await context.params
    const sync = await syncAgentSession({ userId: user.id, sessionId, afterSequence, limit })
    if (!sync) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    return NextResponse.json(sync)
  } catch (error) {
    console.error("[api/desktop/nova/sessions/:sessionId/sync]", error)
    return NextResponse.json({ error: "Failed to sync Nova session" }, { status: 500 })
  }
}

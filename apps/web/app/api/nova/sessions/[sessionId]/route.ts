import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { getAgentSession } from "@/modules/nova/sessions/service"

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const authSession = await auth.api.getSession({ headers: await headers() })
    if (!authSession?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const { sessionId } = await context.params
    const session = await getAgentSession(authSession.user.id, sessionId)
    if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    return NextResponse.json({ session })
  } catch (error) {
    console.error("[api/nova/sessions/:sessionId]", error)
    return NextResponse.json({ error: "Failed to load Nova session" }, { status: 500 })
  }
}

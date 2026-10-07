import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { createAgentSession, listAgentSessions } from "@/modules/nova/sessions/service"

const createSessionSchema = z.object({
  objective: z.string().trim().min(1).max(20_000),
  mode: z.string().trim().min(1).max(64).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const user = await getDesktopReviewUser(request.headers.get("authorization"))
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json({ sessions: await listAgentSessions(user.id) })
  } catch (error) {
    console.error("[api/desktop/nova/sessions]", error)
    return NextResponse.json({ error: "Failed to load Nova sessions" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getDesktopReviewUser(request.headers.get("authorization"))
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const parsed = createSessionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid session", issues: parsed.error.issues }, { status: 400 })
    }
    const session = await createAgentSession({
      userId: user.id,
      objective: parsed.data.objective,
      mode: parsed.data.mode,
      surface: "desktop",
    })
    return NextResponse.json({ session }, { status: 201 })
  } catch (error) {
    console.error("[api/desktop/nova/sessions]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Nova session" },
      { status: 500 },
    )
  }
}

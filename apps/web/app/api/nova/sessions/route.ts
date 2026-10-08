import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createAgentSession, listAgentSessions } from "@/modules/nova/sessions/service"

const createSessionSchema = z.object({
  objective: z.string().trim().min(1).max(20_000),
  mode: z.string().trim().min(1).max(64).optional(),
  surface: z.enum(["web", "desktop"]).optional(),
  localProjectId: z.string().trim().min(1).max(64).optional().nullable(),
})

async function currentUserId() {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

export async function GET() {
  try {
    const userId = await currentUserId()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json({ sessions: await listAgentSessions(userId) })
  } catch (error) {
    console.error("[api/nova/sessions]", error)
    return NextResponse.json({ error: "Failed to load Nova sessions" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await currentUserId()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const parsed = createSessionSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid session", issues: parsed.error.issues }, { status: 400 })
    }
    const session = await createAgentSession({
      userId,
      objective: parsed.data.objective,
      mode: parsed.data.mode,
      surface: parsed.data.surface ?? "web",
      localProjectId: parsed.data.localProjectId,
    })
    return NextResponse.json({ session }, { status: 201 })
  } catch (error) {
    console.error("[api/nova/sessions]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create Nova session" },
      { status: 500 },
    )
  }
}

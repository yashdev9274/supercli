import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { postSessionMessage } from "@/modules/nova/sessions/service"

const postMessageSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  clientMessageId: z.string().trim().min(1).max(128).optional(),
  surface: z.enum(["web", "desktop"]).optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const parsed = postMessageSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid message", issues: parsed.error.issues }, { status: 400 })
    }

    const { sessionId } = await context.params
    const posted = await postSessionMessage({
      userId: session.user.id,
      sessionId,
      content: parsed.data.content,
      clientMessageId: parsed.data.clientMessageId,
      surface: parsed.data.surface ?? "web",
    })
    if (!posted) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    return NextResponse.json(posted, { status: 201 })
  } catch (error) {
    console.error("[api/nova/sessions/:sessionId/messages]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to post message" },
      { status: 500 },
    )
  }
}

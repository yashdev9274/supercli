import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { postSessionMessage } from "@/modules/nova/sessions/service"

const postMessageSchema = z.object({
  content: z.string().trim().min(1).max(20_000),
  clientMessageId: z.string().trim().min(1).max(128).optional(),
})

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getDesktopReviewUser(request.headers.get("authorization"))
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const parsed = postMessageSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid message", issues: parsed.error.issues }, { status: 400 })
    }

    const { sessionId } = await context.params
    const posted = await postSessionMessage({
      userId: user.id,
      sessionId,
      content: parsed.data.content,
      clientMessageId: parsed.data.clientMessageId,
      surface: "desktop",
    })
    if (!posted) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    return NextResponse.json(posted, { status: 201 })
  } catch (error) {
    console.error("[api/desktop/nova/sessions/:sessionId/messages]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to post message" },
      { status: 500 },
    )
  }
}

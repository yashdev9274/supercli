import { NextRequest, NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { triggerDesktopReview } from "@/modules/reviews/desktop-service"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getDesktopReviewUser(request.headers.get("authorization"))
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await context.params
    const result = await triggerDesktopReview(user.id, decodeURIComponent(id))
    if (!result) {
      return NextResponse.json({ error: "Pull request not found" }, { status: 404 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error("[api/desktop/reviews/trigger]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run review" },
      { status: 500 },
    )
  }
}

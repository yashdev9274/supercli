import { NextRequest, NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { getDesktopReview } from "@/modules/reviews/desktop-service"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getDesktopReviewUser(request.headers.get("authorization"))
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await context.params
    const review = await getDesktopReview(user.id, decodeURIComponent(id))
    if (!review) {
      return NextResponse.json({ error: "Pull request not found" }, { status: 404 })
    }
    return NextResponse.json(review)
  } catch (error) {
    console.error("[api/desktop/reviews/detail]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load review" },
      { status: 500 },
    )
  }
}

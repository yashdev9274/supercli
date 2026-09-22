import { NextRequest, NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { listDesktopReviews } from "@/modules/reviews/desktop-service"

export async function GET(request: NextRequest) {
  try {
    const user = await getDesktopReviewUser(request.headers.get("authorization"))
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    return NextResponse.json(await listDesktopReviews(user.id))
  } catch (error) {
    console.error("[api/desktop/reviews]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load reviews" },
      { status: 500 },
    )
  }
}

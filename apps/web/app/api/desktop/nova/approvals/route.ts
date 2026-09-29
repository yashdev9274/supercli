import { NextRequest, NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { listApprovals } from "@/modules/nova/approvals/service"

export async function GET(request: NextRequest) {
  try {
    const user = await getDesktopReviewUser(request.headers.get("authorization"))
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json(await listApprovals(user.id))
  } catch (error) {
    console.error("[api/desktop/nova/approvals]", error)
    return NextResponse.json({ error: "Failed to load Nova approvals" }, { status: 500 })
  }
}

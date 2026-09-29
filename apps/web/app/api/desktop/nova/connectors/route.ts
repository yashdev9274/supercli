import { NextRequest, NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { listConnectorStatuses } from "@/modules/nova/connectors/service"

export async function GET(request: NextRequest) {
  try {
    const user = await getDesktopReviewUser(request.headers.get("authorization"))
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ connectors: await listConnectorStatuses(user.id, "desktop") })
  } catch (error) {
    console.error("[api/desktop/nova/connectors]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Nova connectors" },
      { status: 500 },
    )
  }
}

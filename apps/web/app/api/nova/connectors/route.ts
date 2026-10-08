import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { listConnectorStatuses } from "@/modules/nova/connectors/service"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json({
      connectors: await listConnectorStatuses(session.user.id, "web"),
    })
  } catch (error) {
    console.error("[api/nova/connectors]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load Nova connectors" },
      { status: 500 },
    )
  }
}

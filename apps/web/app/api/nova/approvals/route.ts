import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { listApprovals } from "@/modules/nova/approvals/service"

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() })
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    return NextResponse.json(await listApprovals(session.user.id))
  } catch (error) {
    console.error("[api/nova/approvals]", error)
    return NextResponse.json({ error: "Failed to load Nova approvals" }, { status: 500 })
  }
}

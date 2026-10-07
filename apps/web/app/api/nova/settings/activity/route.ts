import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { getSettingsActivity } from "@/modules/nova/settings/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const range = Number(request.nextUrl.searchParams.get("range") ?? "30")
  try {
    const activity = await getSettingsActivity(session.user.id, Number.isFinite(range) ? range : 30)
    return NextResponse.json(activity, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load activity" },
      { status },
    )
  }
}

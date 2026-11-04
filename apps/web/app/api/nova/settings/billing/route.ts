import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

import { getBillingInfo } from "@/modules/nova/settings/billing-service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const info = await getBillingInfo({
      userId: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image,
    })
    return NextResponse.json(info, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode ?? 500
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load billing" },
      { status },
    )
  }
}

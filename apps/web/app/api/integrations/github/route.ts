import { NextResponse } from "next/server"
import { auth } from "@super/auth/server"
import { headers } from "next/headers"

import { beginProviderConnect } from "@/modules/integrations/lib/connect-flow"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const result = await beginProviderConnect({ userId: session.user.id, provider: "github" })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.redirect(result.redirectUrl)
}

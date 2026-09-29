import { NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { createDesktopComposioSession } from "@/modules/integrations/lib/desktop-composio"

export async function POST(request: Request) {
  const user = await getDesktopReviewUser(request.headers.get("authorization"))
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json(await createDesktopComposioSession(user.id))
}

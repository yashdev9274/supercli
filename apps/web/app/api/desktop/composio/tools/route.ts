import { NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { listDesktopComposioTools } from "@/modules/integrations/lib/desktop-composio"

export async function POST(request: Request) {
  const user = await getDesktopReviewUser(request.headers.get("authorization"))
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ tools: await listDesktopComposioTools(user.id) })
}

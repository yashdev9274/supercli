import { NextResponse } from "next/server"

import { getDesktopReviewUser } from "@/lib/desktop-auth"
import { executeDesktopComposioTool } from "@/modules/integrations/lib/desktop-composio"

export async function POST(request: Request) {
  const user = await getDesktopReviewUser(request.headers.get("authorization"))
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const body = await request.json().catch(() => null) as {
    toolName?: unknown
    arguments?: unknown
  } | null
  if (
    typeof body?.toolName !== "string" ||
    !body.arguments ||
    typeof body.arguments !== "object" ||
    Array.isArray(body.arguments)
  ) {
    return NextResponse.json({ error: "A tool name and arguments object are required" }, { status: 400 })
  }
  const result = await executeDesktopComposioTool({
    userId: user.id,
    toolName: body.toolName,
    arguments: body.arguments as Record<string, unknown>,
  })
  return NextResponse.json({
    data: result?.data ?? null,
    error: result?.error ?? null,
    successful: result?.successful ?? false,
  })
}

import { NextResponse } from "next/server"
import { disconnectIntegration } from "@/modules/integrations/actions"

export const runtime = "nodejs"

export async function POST() {
  const result = await disconnectIntegration("slack")
  if (!result.success) {
    return NextResponse.json(result, { status: 400 })
  }
  return NextResponse.json(result)
}

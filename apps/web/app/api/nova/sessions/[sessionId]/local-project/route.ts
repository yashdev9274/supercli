import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { bindSessionProjectSchema } from "@/modules/nova/local-projects/contracts"
import {
  bindSessionLocalProject,
  getSessionLocalProject,
} from "@/modules/nova/local-projects/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { sessionId } = await context.params
  try {
    const project = await getSessionLocalProject(session.user.id, sessionId)
    return NextResponse.json({ project })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load session project" },
      { status: 400 },
    )
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { sessionId } = await context.params
  const parsed = bindSessionProjectSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid bind payload", issues: parsed.error.issues }, { status: 400 })
  }
  try {
    const result = await bindSessionLocalProject(session.user.id, sessionId, parsed.data.projectId)
    if (!result) return NextResponse.json({ error: "Session not found" }, { status: 404 })
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to bind local project" },
      { status: 400 },
    )
  }
}

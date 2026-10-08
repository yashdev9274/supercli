import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { updateLocalProjectSchema } from "@/modules/nova/local-projects/contracts"
import { getLocalProject, updateLocalProject } from "@/modules/nova/local-projects/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { projectId } = await context.params
  const project = await getLocalProject(session.user.id, projectId, true)
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ project })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { projectId } = await context.params
  const parsed = updateLocalProjectSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid update", issues: parsed.error.issues }, { status: 400 })
  }
  try {
    const project = await updateLocalProject(session.user.id, projectId, parsed.data)
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ project })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update local project" },
      { status: 400 },
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { projectId } = await context.params
  const project = await updateLocalProject(session.user.id, projectId, { status: "archived" })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ project })
}

import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { upsertLocalProjectSchema } from "@/modules/nova/local-projects/contracts"
import { createLocalProject, listLocalProjects } from "@/modules/nova/local-projects/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  try {
    const projects = await listLocalProjects(session.user.id)
    return NextResponse.json({ projects })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list local projects" },
      { status: 400 },
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const parsed = upsertLocalProjectSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid local project", issues: parsed.error.issues }, { status: 400 })
  }
  try {
    const project = await createLocalProject(session.user.id, parsed.data)
    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create local project" },
      { status: 400 },
    )
  }
}

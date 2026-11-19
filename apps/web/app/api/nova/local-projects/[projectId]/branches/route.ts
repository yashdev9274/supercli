import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { listGithubBranches } from "@/modules/nova/local-projects/github"
import { getLocalProject } from "@/modules/nova/local-projects/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { projectId } = await context.params
    const project = await getLocalProject(session.user.id, projectId)
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!project.repositoryFullName) return NextResponse.json({ error: "Project is not connected to GitHub" }, { status: 400 })
    return NextResponse.json(await listGithubBranches(session.user.id, project.repositoryFullName))
  } catch {
    return NextResponse.json({ error: "Could not load GitHub branches. Check your connected repository and GitHub authorization." }, { status: 502 })
  }
}

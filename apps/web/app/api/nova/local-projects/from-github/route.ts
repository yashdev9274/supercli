import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { upsertGithubLocalProject } from "@/modules/nova/local-projects/github"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const bodySchema = z.object({
  fullName: z.string().trim().min(3).max(200).regex(/^[^/]+\/[^/]+$/),
})

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid repository", issues: parsed.error.issues }, { status: 400 })
  }

  try {
    const project = await upsertGithubLocalProject(session.user.id, parsed.data.fullName)
    if (!project) {
      return NextResponse.json({ error: "Could not create project from repository" }, { status: 400 })
    }
    return NextResponse.json({ project }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to index GitHub repository" },
      { status: 400 },
    )
  }
}

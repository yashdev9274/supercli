import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { githubSourceFilePathSchema, readSessionGithubSourceFile } from "@/modules/nova/local-projects/github"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const path = githubSourceFilePathSchema.optional().safeParse(request.nextUrl.searchParams.get("path") ?? undefined)
  if (!path.success) return NextResponse.json({ error: "Invalid source file path" }, { status: 400 })
  try {
    const { sessionId } = await context.params
    const file = await readSessionGithubSourceFile(session.user.id, sessionId, path.data)
    if (!file) return NextResponse.json({ error: "Pinned source file not found" }, { status: 404 })
    return NextResponse.json(file, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Could not load pinned GitHub source file. Check repository access and file size." }, { status: 502 })
  }
}

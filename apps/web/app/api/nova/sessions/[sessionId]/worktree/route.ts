import { auth } from "@super/auth/server"
import { headers } from "next/headers"
import { NextResponse } from "next/server"

import {
  bindLocalWorktree,
  bindLocalWorktreeSchema,
  getLocalWorktreeBinding,
  isLocalWorktreeRequestOrigin,
  LocalWorktreeBindingError,
} from "@/modules/nova/local-projects/worktree-binding"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof LocalWorktreeBindingError ? error.message : "Failed to access local workspace binding" },
    { status: error instanceof LocalWorktreeBindingError ? error.status : 500 },
  )
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { sessionId } = await context.params
    const binding = await getLocalWorktreeBinding(session.user.id, sessionId)
    return NextResponse.json({ binding }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return failure(error)
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ sessionId: string }> },
) {
  if (!isLocalWorktreeRequestOrigin(request)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const parsed = bindLocalWorktreeSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid binding payload" }, { status: 400 })
  try {
    const { sessionId } = await context.params
    const binding = await bindLocalWorktree(session.user.id, sessionId, parsed.data.binding)
    return NextResponse.json({ binding }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    return failure(error)
  }
}

import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@super/auth/server"
import { reviewPullRequest } from "@/modules/ai/action"
import prisma from "@super/db"

/**
 * POST /api/reviews/trigger
 * Body: { owner, repo, prNumber }
 * Manually queue an AI review for a connected repo (useful when webhooks can't reach localhost).
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    })

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const owner = String(body.owner ?? "").trim()
    const repo = String(body.repo ?? "").trim()
    const prNumber = Number(body.prNumber)

    if (!owner || !repo || !Number.isFinite(prNumber) || prNumber <= 0) {
      return NextResponse.json(
        { error: "owner, repo, and prNumber are required" },
        { status: 400 },
      )
    }

    const repository = await prisma.repository.findFirst({
      where: {
        owner,
        name: repo,
        userId: session.user.id,
      },
    })

    if (!repository) {
      return NextResponse.json(
        { error: `Repository ${owner}/${repo} is not connected to your account` },
        { status: 404 },
      )
    }

    const result = await reviewPullRequest(owner, repo, prNumber)
    return NextResponse.json(result)
  } catch (error) {
    console.error("[api/reviews/trigger]", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to queue review",
      },
      { status: 500 },
    )
  }
}

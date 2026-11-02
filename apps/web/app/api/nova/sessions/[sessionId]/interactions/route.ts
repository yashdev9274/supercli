import { auth } from "@super/auth/server"
import prisma from "@super/db"
import { headers } from "next/headers"
import { NextRequest } from "next/server"
import { z } from "zod"
import { authorizeHarnessRun, decideHarnessInteraction } from "@/modules/nova/harness/durable-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
const decisionSchema = z.object({
  runId: z.string().min(1).max(128), invocationId: z.string().min(1).max(128),
  hash: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(["approve", "deny", "answer"]),
  answers: z.array(z.string().trim().min(1).max(4000)).max(5).optional(),
}).strict()

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user.id) return Response.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { sessionId } = await context.params
    const runId = request.nextUrl.searchParams.get("runId") ?? ""
    await authorizeHarnessRun(session.user.id, sessionId, runId)
    const rows = await prisma.toolInvocation.findMany({ where: { runId, capability: { startsWith: "nova-harness:" }, status: { in: ["awaiting_input", "approved"] } }, select: { id: true, normalizedArgsHash: true, toolName: true, arguments: true, status: true }, take: 10 })
    return Response.json({ interactions: rows }, { headers: { "Cache-Control": "no-store" } })
  } catch { return Response.json({ error: "Interaction unavailable" }, { status: 409 }) }
}

export async function POST(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user.id) return Response.json({ error: "Unauthorized" }, { status: 401 })
  if (request.headers.get("origin") !== request.nextUrl.origin) return Response.json({ error: "Invalid origin" }, { status: 403 })
  try {
    const parsed = decisionSchema.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: "Invalid decision" }, { status: 400 })
    const { sessionId } = await context.params
    return Response.json(await decideHarnessInteraction({ ...parsed.data, userId: session.user.id, sessionId }), { headers: { "Cache-Control": "no-store" } })
  } catch { return Response.json({ error: "Interaction expired, changed, or already decided" }, { status: 409 }) }
}

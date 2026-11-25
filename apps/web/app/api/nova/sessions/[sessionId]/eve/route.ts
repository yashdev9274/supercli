import { auth } from "@super/auth/server"
import { assertCodexOrigin } from "@/modules/nova/codex/request"
import { submitEveHttp, currentEveHttp, eveHttpError } from "@/modules/nova/eve/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user?.id) return Response.json({ error: "Unauthorized" }, { status: 401 })
    return await currentEveHttp(session.user.id, (await context.params).sessionId)
  } catch (error) { return eveHttpError(error) }
}

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    assertCodexOrigin(request)
    const session = await auth.api.getSession({ headers: request.headers })
    const user = session?.user
    if (!user?.id) return Response.json({ error: "Unauthorized or unverified account" }, { status: 401 })
    const { sessionId } = await context.params
    let body: unknown
    try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
    return await submitEveHttp(user.id, sessionId, body, "web")
  } catch (error) { return eveHttpError(error) }
}

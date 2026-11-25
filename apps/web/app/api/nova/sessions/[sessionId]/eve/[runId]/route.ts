import { auth } from "@super/auth/server"
import { assertCodexOrigin } from "@/modules/nova/codex/request"
import { cancelEveHttp, eveHttpError } from "@/modules/nova/eve/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(request: Request, context: { params: Promise<{ sessionId: string; runId: string }> }) {
  try {
    assertCodexOrigin(request)
    const session = await auth.api.getSession({ headers: request.headers })
    const user = session?.user
    if (!user?.id) return Response.json({ error: "Unauthorized or unverified account" }, { status: 401 })
    const { sessionId, runId } = await context.params
    return await cancelEveHttp(user.id, sessionId, runId)
  } catch (error) { return eveHttpError(error) }
}

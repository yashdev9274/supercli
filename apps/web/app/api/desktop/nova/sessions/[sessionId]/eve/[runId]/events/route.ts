import { getEveDesktopUser } from "@/modules/nova/eve/desktop-auth"
import { readEveHttp, eveHttpError } from "@/modules/nova/eve/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request, context: { params: Promise<{ sessionId: string; runId: string }> }) {
  try {
    const user = await getEveDesktopUser(request.headers.get("authorization"))
    if (!user?.id) return Response.json({ error: "Unauthorized or unverified account" }, { status: 401 })
    const { sessionId, runId } = await context.params
    return await readEveHttp(user.id, sessionId, runId, new URL(request.url).searchParams.get("after") ?? "")
  } catch (error) { return eveHttpError(error) }
}

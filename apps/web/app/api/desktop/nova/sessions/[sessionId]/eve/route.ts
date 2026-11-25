import { getEveDesktopUser } from "@/modules/nova/eve/desktop-auth"
import { submitEveHttp, eveHttpError } from "@/modules/nova/eve/http"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const user = await getEveDesktopUser(request.headers.get("authorization"))
    if (!user?.id) return Response.json({ error: "Unauthorized or unverified account" }, { status: 401 })
    const { sessionId } = await context.params
    let body: unknown
    try { body = await request.json() } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }) }
    return await submitEveHttp(user.id, sessionId, body, "desktop")
  } catch (error) { return eveHttpError(error) }
}

import { auth } from "@super/auth/server"

import { BrowserError } from "@/modules/nova/browser/contracts"
import { assertBrowserOrigin, browserErrorResponse, parseBrowserControl } from "@/modules/nova/browser/request"
import { browserService } from "@/modules/nova/browser/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

type Context = { params: Promise<{ sessionId: string }> }
async function handle(request: Request, context: Context) {
  try {
    if (request.method !== "GET") assertBrowserOrigin(request)
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user?.id) throw new BrowserError("Unauthorized", 401)
    const { sessionId } = await context.params
    const scope = { userId: session.user.id, sessionId }
    const service = browserService()
    const state = request.method === "POST" ? await service.start(scope)
      : request.method === "DELETE" ? await service.stop(scope)
      : request.method === "PATCH" ? await service.control(scope, await parseBrowserControl(request))
      : await service.state(scope)
    return Response.json(state, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
  } catch (error) {
    return browserErrorResponse(error)
  }
}
export const GET = handle
export const POST = handle
export const PATCH = handle
export const DELETE = handle

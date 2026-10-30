import { auth } from "@super/auth/server"

import { BrowserError } from "@/modules/nova/browser/contracts"
import { browserErrorResponse } from "@/modules/nova/browser/request"
import { browserService } from "@/modules/nova/browser/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user?.id) throw new BrowserError("Unauthorized", 401)
    const { sessionId } = await context.params
    const version = new URL(request.url).searchParams.get("version") ?? ""
    if (!/^[a-f0-9-]{36}$/.test(version)) throw new BrowserError("Screenshot not found", 404)
    const image = await browserService().screenshot({ userId: session.user.id, sessionId }, version)
    return new Response(new Uint8Array(image), { headers: {
      "Content-Type": "image/jpeg", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer", "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    } })
  } catch (error) {
    return browserErrorResponse(error)
  }
}

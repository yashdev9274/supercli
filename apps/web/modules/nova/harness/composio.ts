import { auth } from "@super/auth/server"
import { NextResponse } from "next/server"

import { ensureHarnessToken } from "./auth"

export { requestHarnessComposio } from "./composio-client"

export async function withHarnessComposio(
  request: Request,
  action: (token: string) => Promise<unknown>,
): Promise<NextResponse> {
  let setCookie: string | undefined
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const harness = await ensureHarnessToken(session.user)
    setCookie = harness.setCookie
    const response = NextResponse.json(await action(harness.token), { headers: { "Cache-Control": "no-store" } })
    if (setCookie) response.headers.append("Set-Cookie", setCookie)
    return response
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode ?? 502
    const response = NextResponse.json(
      { error: error instanceof Error ? error.message : "The CLI Composio service is unavailable" },
      { status, headers: { "Cache-Control": "no-store" } },
    )
    if (setCookie) response.headers.append("Set-Cookie", setCookie)
    return response
  }
}

import { CodexError } from "@super/codex-runtime/provider"

import { agentUsageForRequest } from "@/modules/nova/agent-usage/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 40

const headers = { "Cache-Control": "no-store, private", Pragma: "no-cache", Vary: "Cookie, Authorization" }

export async function GET(request: Request) {
  try {
    return Response.json(await agentUsageForRequest(request), { headers })
  } catch (error) {
    const status = error instanceof CodexError && [401, 403].includes(error.statusCode) ? error.statusCode : 503
    const message = status === 401 ? "Sign in to Nova to check agent usage."
      : status === 403 ? "Active organization membership is required."
        : "Agent usage is unavailable. Please retry shortly."
    return Response.json({ error: message }, { status, headers })
  }
}

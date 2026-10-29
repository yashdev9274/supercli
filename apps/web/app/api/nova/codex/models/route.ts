import { codexPublicError } from "@/modules/nova/codex/errors"
import { createCodexRuntime } from "@/modules/nova/codex/runtime"
import { codexContextForRequest } from "@/modules/nova/codex/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 40
const headers = { "Cache-Control": "no-store, private", Pragma: "no-cache" }

export async function GET(request: Request) {
  try {
    const context = await codexContextForRequest(request)
    const row = await context.store.get()
    if (row.state !== "connected") return Response.json({ connected: false, models: [] }, { headers })
    const models = await createCodexRuntime(context).catalog(request.signal)
    return Response.json({ connected: true, models }, { headers })
  } catch (error) {
    const safe = codexPublicError(error)
    return Response.json({ error: safe.message }, { status: safe.statusCode, headers })
  }
}

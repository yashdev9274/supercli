import { codexPublicError } from "@/modules/nova/codex/errors"
import { assertCodexOrigin, parseCodexAction } from "@/modules/nova/codex/request"
import { codexServiceForRequest } from "@/modules/nova/codex/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 40

const responseHeaders = { "Cache-Control": "no-store, private", "Pragma": "no-cache", "Referrer-Policy": "no-referrer" }
function failure(error: unknown) {
  const safe = codexPublicError(error)
  const status = safe.statusCode
  return Response.json({ error: safe.message }, {
    status,
    headers: { ...responseHeaders, ...(status === 429 ? { "Retry-After": "60" } : {}) },
  })
}

export async function GET(request: Request) {
  try {
    const service = await codexServiceForRequest(request)
    return Response.json(await service.status(), { headers: responseHeaders })
  } catch (error) { return failure(error) }
}

export async function POST(request: Request) {
  try {
    assertCodexOrigin(request)
    const action = await parseCodexAction(request)
    const service = await codexServiceForRequest(request)
    const result = action.action === "start" ? await service.start()
      : action.action === "poll" ? await service.poll(action.attemptId)
        : action.action === "cancel" ? await service.cancel(action.attemptId)
          : await service.disconnect()
    return Response.json(result, { headers: responseHeaders })
  } catch (error) { return failure(error) }
}

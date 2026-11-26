import { resolveVoiceCaller } from "@/modules/nova/voice/auth"
import { voiceModelCatalog, voiceProviderFailure } from "@/modules/nova/voice/providers"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 40

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store, private", Pragma: "no-cache" }
  try {
    const caller = await resolveVoiceCaller(request)
    if (!caller) return Response.json({ error: "Unauthorized" }, { status: 401, headers })
    const provider = new URL(request.url).searchParams.get("provider") || "supercode"
    return Response.json(await voiceModelCatalog(caller, provider, request.signal), { headers })
  } catch (error) {
    const safe = voiceProviderFailure(error)
    return Response.json({ error: safe.message }, { status: safe.status, headers })
  }
}

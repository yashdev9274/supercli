import { NextRequest } from "next/server"

import { fetchProviderCatalog } from "@/modules/nova/provider-credentials/catalog"
import { readProviderApiKey } from "@/modules/nova/provider-credentials/server"
import { ProviderCredentialError } from "@/modules/nova/provider-credentials/vault"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params
    const state = await readProviderApiKey(request, provider)
    if (!state.apiKey) return Response.json({ connected: false, models: [] }, { headers: { "Cache-Control": "no-store" } })
    return Response.json({ connected: true, models: await fetchProviderCatalog(state.provider, state.apiKey, request.signal) }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = error instanceof ProviderCredentialError ? error.statusCode : 502
    return Response.json({ error: error instanceof Error ? error.message : "Could not load provider models" }, { status, headers: { "Cache-Control": "no-store" } })
  }
}

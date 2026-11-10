import { NextRequest } from "next/server"
import { z } from "zod"

import { fetchProviderCatalog } from "@/modules/nova/provider-credentials/catalog"
import { readProviderConfig } from "@/modules/nova/provider-credentials/server"
import { providerCredentialContext } from "@/modules/nova/provider-credentials/server"
import { ProviderCredentialError } from "@/modules/nova/provider-credentials/vault"
import { requiresProviderApiKey } from "@/modules/nova/provider-credentials/connection-rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const checkSchema = z.object({ apiKey: z.string().trim().max(4096).optional().default(""), baseUrl: z.string().trim().url().max(2048), name: z.string().trim().max(200).optional(), apiFamily: z.enum(["openai", "anthropic", "google"]).optional(), headers: z.record(z.string().max(200), z.string().max(4096)).optional() })

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params
    const state = await readProviderConfig(request, provider)
    if (!state.config) return Response.json({ connected: false, models: [] }, { headers: { "Cache-Control": "no-store" } })
    const models = state.config.models?.length ? state.config.models : await fetchProviderCatalog(state.provider, state.config, request.signal)
    return Response.json({ connected: true, models }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = error instanceof ProviderCredentialError ? error.statusCode : 502
    return Response.json({ error: error instanceof Error ? error.message : "Could not load provider models" }, { status, headers: { "Cache-Control": "no-store" } })
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params
    const state = await providerCredentialContext(request, provider)
    const parsed = checkSchema.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: "Enter a valid base URL" }, { status: 400 })
    if (requiresProviderApiKey(state.provider, parsed.data.baseUrl) && !parsed.data.apiKey) return Response.json({ error: state.provider === "ollama" ? "Use a local Ollama URL without a key, or provide an Ollama Cloud API key" : "Enter an API key" }, { status: 400 })
    const models = await fetchProviderCatalog(state.provider, parsed.data, request.signal)
    return Response.json({ connected: true, models }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const status = error instanceof ProviderCredentialError ? error.statusCode : 502
    return Response.json({ error: error instanceof Error ? error.message : "Could not check provider access" }, { status, headers: { "Cache-Control": "no-store" } })
  }
}

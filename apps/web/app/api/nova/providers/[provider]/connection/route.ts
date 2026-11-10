import { NextRequest } from "next/server"
import { z } from "zod"

import { fetchProviderCatalog } from "@/modules/nova/provider-credentials/catalog"
import { providerCredentialContext, type StoredProviderConfig } from "@/modules/nova/provider-credentials/server"
import { ProviderCredentialError } from "@/modules/nova/provider-credentials/vault"
import prisma from "@super/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const modelSchema = z.object({ id: z.string().trim().min(1).max(200), label: z.string().trim().min(1).max(200), description: z.string().max(500).optional() })
const configSchema = z.object({
  apiKey: z.string().trim().min(1).max(4096),
  name: z.string().trim().max(200).optional(),
  baseUrl: z.string().trim().url().max(2048).optional().or(z.literal("")),
  apiFamily: z.enum(["openai", "anthropic", "google"]).optional(),
  headers: z.record(z.string().max(200), z.string().max(4096)).optional(),
  models: z.array(modelSchema).max(500).optional(),
})
const toggleSchema = z.object({ enabled: z.boolean() })

function failure(error: unknown) {
  const status = error instanceof ProviderCredentialError ? error.statusCode : 502
  return Response.json({ error: error instanceof Error ? error.message : "Provider connection failed" }, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params
    const state = await providerCredentialContext(request, provider)
    const row = await prisma.novaProviderCredential.findUnique({ where: { membershipId_provider: { membershipId: state.membershipId, provider: state.provider } }, select: { status: true, enabled: true, lastVerifiedAt: true, encryptedApiKey: true } })
    if (!row || row.status !== "connected") return Response.json({ connected: false, enabled: false, lastVerifiedAt: null }, { headers: { "Cache-Control": "no-store" } })
    let config: Partial<StoredProviderConfig> = {}
    try { config = JSON.parse(state.vault.open(row.encryptedApiKey, state.binding)) as Partial<StoredProviderConfig> } catch { /* Legacy rows do not expose metadata. */ }
    return Response.json({ connected: true, enabled: row.enabled, lastVerifiedAt: row.lastVerifiedAt?.toISOString() ?? null, name: config.name, baseUrl: config.baseUrl, models: config.models ?? [] }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params
    const state = await providerCredentialContext(request, provider)
    const parsed = configSchema.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: "Enter a valid API key and base URL" }, { status: 400 })
    const config = parsed.data satisfies StoredProviderConfig
    const models = await fetchProviderCatalog(state.provider, config, request.signal).catch((error) => {
      if (config.models?.length) return config.models
      throw error
    })
    const saved = { ...config, models: models.length ? models : (config.models ?? []) }
    await prisma.novaProviderCredential.upsert({
      where: { membershipId_provider: { membershipId: state.membershipId, provider: state.provider } },
      create: { membershipId: state.membershipId, provider: state.provider, encryptedApiKey: state.vault.seal(JSON.stringify(saved), state.binding), lastVerifiedAt: new Date() },
      update: { encryptedApiKey: state.vault.seal(JSON.stringify(saved), state.binding), status: "connected", enabled: true, lastVerifiedAt: new Date() },
    })
    return Response.json({ connected: true, models: saved.models }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return failure(error) }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params
    const state = await providerCredentialContext(request, provider)
    const parsed = toggleSchema.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: "enabled must be a boolean" }, { status: 400 })
    const row = await prisma.novaProviderCredential.updateMany({ where: { membershipId: state.membershipId, provider: state.provider, status: "connected" }, data: { enabled: parsed.data.enabled } })
    if (row.count === 0) return Response.json({ error: "Provider is not connected" }, { status: 404 })
    return Response.json({ connected: true, enabled: parsed.data.enabled }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return failure(error) }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params
    const state = await providerCredentialContext(request, provider)
    await prisma.novaProviderCredential.deleteMany({ where: { membershipId: state.membershipId, provider: state.provider } })
    return Response.json({ connected: false }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return failure(error) }
}

import { NextRequest } from "next/server"
import { z } from "zod"

import { fetchProviderCatalog } from "@/modules/nova/provider-credentials/catalog"
import { providerCredentialContext } from "@/modules/nova/provider-credentials/server"
import { ProviderCredentialError } from "@/modules/nova/provider-credentials/vault"
import prisma from "@super/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const inputSchema = z.object({ apiKey: z.string().trim().min(1).max(4096) })

function failure(error: unknown) {
  const status = error instanceof ProviderCredentialError ? error.statusCode : 502
  return Response.json({ error: error instanceof Error ? error.message : "Provider connection failed" }, { status, headers: { "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params
    const state = await providerCredentialContext(request, provider)
    const row = await prisma.novaProviderCredential.findUnique({ where: { membershipId_provider: { membershipId: state.membershipId, provider: state.provider } }, select: { status: true, lastVerifiedAt: true } })
    return Response.json({ connected: row?.status === "connected", lastVerifiedAt: row?.lastVerifiedAt?.toISOString() ?? null }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest, context: { params: Promise<{ provider: string }> }) {
  try {
    const { provider } = await context.params
    const state = await providerCredentialContext(request, provider)
    const parsed = inputSchema.safeParse(await request.json())
    if (!parsed.success) return Response.json({ error: "Enter a provider API key" }, { status: 400 })
    const models = await fetchProviderCatalog(state.provider, parsed.data.apiKey, request.signal)
    await prisma.novaProviderCredential.upsert({
      where: { membershipId_provider: { membershipId: state.membershipId, provider: state.provider } },
      create: { membershipId: state.membershipId, provider: state.provider, encryptedApiKey: state.vault.seal(parsed.data.apiKey, state.binding), lastVerifiedAt: new Date() },
      update: { encryptedApiKey: state.vault.seal(parsed.data.apiKey, state.binding), status: "connected", lastVerifiedAt: new Date() },
    })
    return Response.json({ connected: true, models }, { headers: { "Cache-Control": "no-store" } })
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

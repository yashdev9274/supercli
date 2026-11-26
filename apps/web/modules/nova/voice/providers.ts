import prisma from "@super/db"

import { createCodexRuntime } from "@/modules/nova/codex/runtime"
import { codexContextForUser } from "@/modules/nova/codex/server"
import { CodexError } from "@/modules/nova/codex/provider"
import type { ChatTransport } from "@/modules/nova/harness/agent"
import { fetchProviderCatalog } from "@/modules/nova/provider-credentials/catalog"
import { createProviderTransport } from "@/modules/nova/provider-credentials/runtime"
import { isProviderCredentialProvider, readProviderConfigForUser } from "@/modules/nova/provider-credentials/server"
import { ProviderCredentialError } from "@/modules/nova/provider-credentials/vault"
import { CLOUD_MODELS, DEFAULT_NOVA_MODEL } from "@/modules/nova-web/models"
import { PROVIDER_INTEGRATION_BY_ID } from "@/modules/nova-web/provider-integrations"
import type { VoiceCaller } from "./auth"

export class VoiceProviderError extends Error {
  constructor(message: string, readonly statusCode = 400) { super(message) }
}

export function voiceProviderFailure(error: unknown) {
  if (error instanceof VoiceProviderError || error instanceof CodexError || error instanceof ProviderCredentialError) {
    return { message: error.message, status: error.statusCode }
  }
  return { message: "Nova could not load the selected provider. Check its connection in Settings → Models.", status: 502 }
}

export async function voiceModelCatalog(caller: VoiceCaller, provider: string, signal: AbortSignal) {
  const user = await prisma.user.findUnique({ where: { id: caller.id }, select: { organizationId: true } })
  if (!user?.organizationId) throw new VoiceProviderError("Set up your Nova organization before choosing an agent", 403)
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: user.organizationId, userId: caller.id } },
    select: { id: true, status: true },
  })
  if (membership?.status !== "active") throw new VoiceProviderError("Active organization membership required", 403)
  const [codex, credentials] = await Promise.all([
    prisma.novaCodexConnection.findUnique({ where: { membershipId: membership.id }, select: { state: true } }),
    prisma.novaProviderCredential.findMany({ where: { membershipId: membership.id, status: "connected", enabled: true }, select: { provider: true } }),
  ])
  const providers = [
    { id: "supercode", label: "Supercode Cloud" },
    ...(codex?.state === "connected" ? [{ id: "codex", label: "Codex" }] : []),
    ...credentials.filter((row) => isProviderCredentialProvider(row.provider)).map((row) => ({ id: row.provider, label: PROVIDER_INTEGRATION_BY_ID[row.provider]?.label ?? row.provider })),
  ]
  if (!providers.some((item) => item.id === provider)) throw new VoiceProviderError("Connect this agent in Nova Settings → Models before selecting it", 409)
  if (provider === "supercode") {
    return { providers, provider, models: CLOUD_MODELS.map((model) => ({ id: model.id, label: model.label, efforts: ["low", "medium", "high"], defaultEffort: "low" })) }
  }
  if (provider === "codex") {
    const runtime = createCodexRuntime(await codexContextForUser(caller.id, caller.sessionId))
    const models = await runtime.catalog(signal)
    return { providers, provider, models: models.map((model) => ({ id: model.id, label: model.label, efforts: model.efforts, defaultEffort: model.defaultEffort })) }
  }
  const state = await readProviderConfigForUser(caller.id, provider)
  if (!state.config) throw new VoiceProviderError("Reconnect this provider in Nova Settings → Models", 409)
  const models = state.config.models?.length ? state.config.models : await fetchProviderCatalog(state.provider, state.config, signal)
  return { providers, provider, models: models.map((model) => ({ id: model.id, label: model.label, efforts: [] as string[], defaultEffort: null })) }
}

export async function prepareVoiceProvider(caller: VoiceCaller, input: { provider?: string; model?: string; effort?: string }, signal: AbortSignal): Promise<{
  provider: string
  model: string
  effort?: string
  chatTransport?: ChatTransport
  childTransport?: (signal?: AbortSignal) => Promise<ChatTransport>
}> {
  const provider = input.provider ?? "supercode"
  if (provider === "supercode") {
    const model = input.model ?? DEFAULT_NOVA_MODEL
    if (!CLOUD_MODELS.some((entry) => entry.id === model)) throw new VoiceProviderError("Select an available Supercode Cloud model")
    return { provider, model, effort: input.effort ?? "low" }
  }
  if (!input.model) throw new VoiceProviderError("Select a model for this coding agent before speaking")
  if (provider === "codex") {
    const runtime = createCodexRuntime(await codexContextForUser(caller.id, caller.sessionId))
    const chatTransport = await runtime.prepare(input.model, input.effort, signal)
    return { provider, model: input.model, effort: input.effort, chatTransport, childTransport: (childSignal) => runtime.prepare(input.model, input.effort, childSignal ?? signal) }
  }
  if (!isProviderCredentialProvider(provider)) throw new VoiceProviderError("Unsupported coding agent")
  const state = await readProviderConfigForUser(caller.id, provider)
  if (!state.config) throw new VoiceProviderError("Connect this agent in Nova Settings → Models before using it", 409)
  const config = state.config
  if (config.models?.length && !config.models.some((entry) => entry.id === input.model)) throw new VoiceProviderError("Select an available model for this coding agent")
  return { provider, model: input.model, effort: input.effort, chatTransport: createProviderTransport(state.provider, config), childTransport: async () => createProviderTransport(state.provider, config) }
}

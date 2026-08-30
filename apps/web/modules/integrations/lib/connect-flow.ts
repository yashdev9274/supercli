import { ensureUserOrganization } from "./org"
import {
  getProviderCallbackUrl,
  isComposioConfigured,
  startComposioConnect,
} from "./composio"
import { createOAuthState } from "./oauth-state"
import type { IntegrationProvider } from "../actions/schema"

export async function beginProviderConnect(params: {
  userId: string
  provider: IntegrationProvider
}): Promise<{ ok: true; redirectUrl: string } | { ok: false; error: string }> {
  if (!isComposioConfigured()) {
    return { ok: false, error: "composio_not_configured" }
  }

  try {
    const organizationId = await ensureUserOrganization(params.userId)
    const state = createOAuthState(params.userId, params.provider)
    const callbackUrl = getProviderCallbackUrl(params.provider, { state })

    const started = await startComposioConnect({
      provider: params.provider,
      organizationId,
      callbackUrl,
    })

    return { ok: true, redirectUrl: started.redirectUrl }
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : typeof error === "object" && error && "message" in error
          ? String((error as { message: unknown }).message)
          : String(error)
    console.error(`beginProviderConnect(${params.provider}) failed:`, detail, error)
    return { ok: false, error: `${params.provider}_start_failed` }
  }
}

import { getIntegrationsSettingsUrl, getNovaConnectionsUrl } from "./app-url"
import { verifyOAuthState, type OAuthReturnTo } from "./oauth-state"
import {
  getComposioConnectedAccount,
} from "./composio"
import { upsertComposioIntegration } from "../actions"
import { ensureUserOrganization } from "./org"
import type { IntegrationProvider } from "../actions/schema"
import { NextResponse } from "next/server"

function completionUrl(
  returnTo: OAuthReturnTo,
  provider: IntegrationProvider,
  error?: string,
  requestOrigin?: string | null,
) {
  if (returnTo === "desktop") {
    const url = new URL("supercode://composio/connected")
    url.searchParams.set("provider", provider)
    if (error) url.searchParams.set("error", error)
    return url
  }
  if (returnTo === "nova") {
    return getNovaConnectionsUrl(
      error ? { error } : { connected: provider },
      requestOrigin,
    )
  }
  return getIntegrationsSettingsUrl(error ? { error } : { connected: provider })
}

/**
 * Handle Composio redirect back to our app after OAuth.
 * Preserves `state` we put on callbackUrl; Composio appends status + connected account id.
 */
export async function handleComposioCallback(params: {
  provider: IntegrationProvider
  searchParams: URLSearchParams
  /** Origin of the callback request so Nova redirects stay on nova.localhost / nova.supercodeai.tech. */
  requestOrigin?: string | null
}): Promise<NextResponse> {
  const { provider, searchParams, requestOrigin } = params

  const status =
    searchParams.get("status") ||
    searchParams.get("connection_status") ||
    ""
  const error =
    searchParams.get("error") ||
    searchParams.get("error_description") ||
    searchParams.get("integration_error")

  // Peek state early so error redirects honor returnTo (nova vs dashboard).
  const state = searchParams.get("state")
  const peeked = state ? verifyOAuthState(state, provider) : null
  const returnTo: OAuthReturnTo = peeked?.returnTo ?? "web"

  if (error || (status && status !== "success" && status !== "ACTIVE")) {
    return NextResponse.redirect(
      completionUrl(returnTo, provider, error || `${provider}_oauth_denied`, requestOrigin),
    )
  }

  if (!state) {
    return NextResponse.redirect(
      completionUrl(returnTo, provider, "missing_oauth_params", requestOrigin),
    )
  }

  const verified = peeked ?? verifyOAuthState(state, provider)
  if (!verified) {
    return NextResponse.redirect(
      completionUrl(returnTo, provider, "invalid_state", requestOrigin),
    )
  }

  const connectedAccountId =
    searchParams.get("connected_account_id") ||
    searchParams.get("connectedAccountId") ||
    searchParams.get("connectedAccountID")

  if (!connectedAccountId) {
    return NextResponse.redirect(
      completionUrl(verified.returnTo, provider, "missing_connected_account", requestOrigin),
    )
  }

  try {
    const account = await getComposioConnectedAccount(connectedAccountId)
    const organizationId = await ensureUserOrganization(verified.userId)
    const expectedEntityId = `org_${organizationId}`
    if (
      !account ||
      account.status !== "ACTIVE" ||
      account.toolkitSlug !== provider ||
      (account.userId && account.userId !== expectedEntityId)
    ) {
      return NextResponse.redirect(
        completionUrl(
          verified.returnTo,
          provider,
          `${provider}_connection_invalid`,
          requestOrigin,
        ),
      )
    }

    await upsertComposioIntegration({
      userId: verified.userId,
      provider,
      connectedAccountId,
      teamName: account?.displayName ?? null,
    })

    return NextResponse.redirect(
      completionUrl(verified.returnTo, provider, undefined, requestOrigin),
    )
  } catch (err) {
    console.error(`Composio ${provider} callback failed:`, err)
    return NextResponse.redirect(
      completionUrl(
        verified.returnTo,
        provider,
        `${provider}_connect_failed`,
        requestOrigin,
      ),
    )
  }
}

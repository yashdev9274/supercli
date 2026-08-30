import { getIntegrationsSettingsUrl } from "./app-url"
import { verifyOAuthState } from "./oauth-state"
import {
  getComposioConnectedAccount,
} from "./composio"
import { upsertComposioIntegration } from "../actions"
import type { IntegrationProvider } from "../actions/schema"
import { NextResponse } from "next/server"

/**
 * Handle Composio redirect back to our app after OAuth.
 * Preserves `state` we put on callbackUrl; Composio appends status + connected account id.
 */
export async function handleComposioCallback(params: {
  provider: IntegrationProvider
  searchParams: URLSearchParams
}): Promise<NextResponse> {
  const { provider, searchParams } = params

  const status =
    searchParams.get("status") ||
    searchParams.get("connection_status") ||
    ""
  const error =
    searchParams.get("error") ||
    searchParams.get("error_description") ||
    searchParams.get("integration_error")

  if (error || (status && status !== "success" && status !== "ACTIVE")) {
    return NextResponse.redirect(
      getIntegrationsSettingsUrl({
        error: error || `${provider}_oauth_denied`,
      }),
    )
  }

  const state = searchParams.get("state")
  if (!state) {
    return NextResponse.redirect(
      getIntegrationsSettingsUrl({ error: "missing_oauth_params" }),
    )
  }

  const verified = verifyOAuthState(state, provider)
  if (!verified) {
    return NextResponse.redirect(
      getIntegrationsSettingsUrl({ error: "invalid_state" }),
    )
  }

  const connectedAccountId =
    searchParams.get("connected_account_id") ||
    searchParams.get("connectedAccountId") ||
    searchParams.get("connectedAccountID")

  if (!connectedAccountId) {
    return NextResponse.redirect(
      getIntegrationsSettingsUrl({ error: "missing_connected_account" }),
    )
  }

  try {
    const account = await getComposioConnectedAccount(connectedAccountId)
    if (account && account.status !== "ACTIVE" && account.status !== "INITIATED") {
      // INITIATED may still settle; store anyway if id present
      if (account.status === "FAILED" || account.status === "EXPIRED") {
        return NextResponse.redirect(
          getIntegrationsSettingsUrl({ error: `${provider}_connection_inactive` }),
        )
      }
    }

    await upsertComposioIntegration({
      userId: verified.userId,
      provider,
      connectedAccountId,
      teamName: account?.displayName ?? null,
    })

    return NextResponse.redirect(
      getIntegrationsSettingsUrl({ connected: provider }),
    )
  } catch (err) {
    console.error(`Composio ${provider} callback failed:`, err)
    return NextResponse.redirect(
      getIntegrationsSettingsUrl({ error: `${provider}_connect_failed` }),
    )
  }
}

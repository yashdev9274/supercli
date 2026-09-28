import prisma from "@super/db"
import { NextResponse } from "next/server"

import { connectorDefinition, type NativeConnectorProvider } from "./config"
import { verifyConnectorState } from "./state"
import { exchangeLinearCode } from "../providers/linear"
import { exchangeSlackCode } from "../providers/slack"

function completionUrl(returnTo: "desktop" | "web", provider: NativeConnectorProvider): string {
  if (returnTo === "desktop") return `supercode://nova/connectors?provider=${provider}&status=connected`
  const base = (process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "")
  return `${base}/dashboard?novaConnector=${provider}`
}

function errorResponse(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}

export async function handleNativeConnectorCallback(
  provider: "slack" | "linear",
  searchParams: URLSearchParams,
): Promise<NextResponse> {
  const providerError = searchParams.get("error")
  if (providerError) return errorResponse(`${provider} authorization was denied: ${providerError}`)
  const code = searchParams.get("code")
  const stateValue = searchParams.get("state")
  if (!code || !stateValue) return errorResponse("Missing OAuth code or state")
  const state = verifyConnectorState(stateValue)
  if (!state || state.provider !== provider) return errorResponse("Invalid or expired OAuth state")

  try {
    const oauth = provider === "slack"
      ? await exchangeSlackCode(code)
      : await exchangeLinearCode(code)
    const definition = connectorDefinition(provider)!
    const missingScopes = definition.requiredConversationScopes.filter(
      (scope) => !oauth.scopes.includes(scope),
    )
    await prisma.externalInstallation.upsert({
      where: {
        organizationId_provider_externalAccountId: {
          organizationId: state.organizationId,
          provider,
          externalAccountId: oauth.externalAccountId,
        },
      },
      create: {
        organizationId: state.organizationId,
        provider,
        externalAccountId: oauth.externalAccountId,
        externalAccountName: oauth.externalAccountName,
        botExternalUserId: oauth.botExternalUserId,
        status: missingScopes.length === 0 ? "active" : "permission_missing",
        grantedScopes: oauth.scopes,
        missingScopes,
        webhookStatus: "pending",
        config: { canReceiveMessages: true, canReplyAsNova: true },
        installedAt: new Date(),
      },
      update: {
        externalAccountName: oauth.externalAccountName,
        botExternalUserId: oauth.botExternalUserId,
        status: missingScopes.length === 0 ? "active" : "permission_missing",
        grantedScopes: oauth.scopes,
        missingScopes,
        webhookStatus: "pending",
        config: { canReceiveMessages: true, canReplyAsNova: true },
        installedAt: new Date(),
      },
    })
    return NextResponse.redirect(completionUrl(state.returnTo, provider), 302)
  } catch (error) {
    console.error(`[nova/${provider}/callback]`, error)
    return errorResponse(
      error instanceof Error ? error.message : `Failed to install Nova in ${provider}`,
      500,
    )
  }
}

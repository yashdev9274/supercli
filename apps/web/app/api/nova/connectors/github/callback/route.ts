import prisma from "@super/db"
import { NextRequest, NextResponse } from "next/server"

import { connectorDefinition } from "@/modules/nova/connectors/config"
import { verifyConnectorState } from "@/modules/nova/connectors/state"
import { getGitHubInstallation } from "@/modules/nova/providers/github"

export const runtime = "nodejs"

function completionUrl(returnTo: "desktop" | "web"): string {
  if (returnTo === "desktop") return "supercode://nova/connectors?provider=github&status=connected"
  const base = (process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/$/, "")
  return `${base}/dashboard?novaConnector=github`
}

export async function GET(request: NextRequest) {
  const installationId = Number(request.nextUrl.searchParams.get("installation_id"))
  const stateValue = request.nextUrl.searchParams.get("state")
  if (!Number.isSafeInteger(installationId) || installationId <= 0 || !stateValue) {
    return NextResponse.json({ error: "Missing GitHub installation or state" }, { status: 400 })
  }
  const state = verifyConnectorState(stateValue)
  if (!state || state.provider !== "github") {
    return NextResponse.json({ error: "Invalid or expired GitHub installation state" }, { status: 400 })
  }

  try {
    const installation = await getGitHubInstallation(installationId)
    const accountId = installation.account?.id
    const accountName = installation.account?.login ?? null
    if (!accountId) throw new Error("GitHub installation did not include an account")
    const definition = connectorDefinition("github")!
    const permissions = installation.permissions ?? {}
    const grantedScopes = Object.entries(permissions).map(([name, access]) => `${name}:${access}`)
    const missingScopes = definition.requiredConversationScopes.filter((scope) => {
      const [name, required] = scope.split(":")
      const actual = permissions[name]
      return required === "read"
        ? actual !== "read" && actual !== "write"
        : actual !== "write"
    })
    await prisma.externalInstallation.upsert({
      where: {
        organizationId_provider_externalAccountId: {
          organizationId: state.organizationId,
          provider: "github",
          externalAccountId: String(accountId),
        },
      },
      create: {
        organizationId: state.organizationId,
        provider: "github",
        externalAccountId: String(accountId),
        externalAccountName: accountName,
        botExternalUserId: process.env.NOVA_GITHUB_APP_SLUG ?? null,
        status: missingScopes.length === 0 ? "active" : "permission_missing",
        grantedScopes,
        missingScopes,
        webhookStatus: "pending",
        config: {
          canReceiveMessages: true,
          canReplyAsNova: true,
          installationId,
          repositorySelection: installation.repository_selection ?? null,
        },
        installedAt: new Date(),
      },
      update: {
        externalAccountName: accountName,
        botExternalUserId: process.env.NOVA_GITHUB_APP_SLUG ?? null,
        status: missingScopes.length === 0 ? "active" : "permission_missing",
        grantedScopes,
        missingScopes,
        webhookStatus: "pending",
        config: {
          canReceiveMessages: true,
          canReplyAsNova: true,
          installationId,
          repositorySelection: installation.repository_selection ?? null,
        },
        installedAt: new Date(),
      },
    })
    return NextResponse.redirect(completionUrl(state.returnTo), 302)
  } catch (error) {
    console.error("[nova/github/callback]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to install the Nova GitHub App" },
      { status: 500 },
    )
  }
}

"use server"

import { auth } from "@super/auth/server"
import prisma from "@super/db"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import {
  ensureUserOrganization,
  getOrganizationIdForUser,
} from "../lib/org"
import {
  composioEntityIdForOrg,
  deleteComposioConnectedAccount,
  isComposioConfigured,
} from "../lib/composio"
import type { IntegrationProvider, IntegrationStatus } from "./schema"
import { integrationProviderSchema } from "./schema"

async function requireSessionUserId(): Promise<string> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  return session.user.id
}

function toStatus(
  provider: IntegrationProvider,
  row: {
    isActive: boolean
    composioConnectedAccountId: string | null
    slackTeamName: string | null
    slackTeamId: string | null
    slackChannelId: string | null
    linearTeamName: string | null
    linearTeamId: string | null
    updatedAt: Date
  } | null,
): IntegrationStatus {
  const connected = Boolean(row?.isActive && row?.composioConnectedAccountId)
  const teamName =
    provider === "slack" ? row?.slackTeamName ?? null : row?.linearTeamName ?? null
  const teamId =
    provider === "slack" ? row?.slackTeamId ?? null : row?.linearTeamId ?? null

  return {
    provider,
    connected,
    isActive: row?.isActive ?? false,
    teamName,
    teamId,
    channelId: provider === "slack" ? row?.slackChannelId ?? null : null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  }
}

export async function getIntegrationStatuses(): Promise<{
  slack: IntegrationStatus
  linear: IntegrationStatus
  composioConfigured: boolean
} | null> {
  try {
    const userId = await requireSessionUserId()
    const organizationId = await getOrganizationIdForUser(userId)
    const composioConfigured = isComposioConfigured()

    if (!organizationId) {
      return {
        slack: toStatus("slack", null),
        linear: toStatus("linear", null),
        composioConfigured,
      }
    }

    const rows = await prisma.integration.findMany({
      where: {
        organizationId,
        provider: { in: ["slack", "linear"] },
      },
    })

    const slack = rows.find((r) => r.provider === "slack") ?? null
    const linear = rows.find((r) => r.provider === "linear") ?? null

    return {
      slack: toStatus("slack", slack),
      linear: toStatus("linear", linear),
      composioConfigured,
    }
  } catch (error) {
    console.error("getIntegrationStatuses failed:", error)
    return null
  }
}

export async function getIntegrationForOrg(
  organizationId: string,
  provider: IntegrationProvider,
) {
  return prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId,
        provider,
      },
    },
  })
}

export async function getIntegrationForUser(
  userId: string,
  provider: IntegrationProvider,
) {
  const organizationId = await getOrganizationIdForUser(userId)
  if (!organizationId) return null
  return getIntegrationForOrg(organizationId, provider)
}

export async function upsertComposioIntegration(params: {
  userId: string
  provider: IntegrationProvider
  connectedAccountId: string
  teamName?: string | null
  teamId?: string | null
}) {
  const organizationId = await ensureUserOrganization(params.userId)
  const entityId = composioEntityIdForOrg(organizationId)

  const base = {
    composioConnectedAccountId: params.connectedAccountId,
    composioEntityId: entityId,
    isActive: true,
  }

  if (params.provider === "slack") {
    return prisma.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId,
          provider: "slack",
        },
      },
      create: {
        organizationId,
        provider: "slack",
        ...base,
        slackTeamName: params.teamName ?? null,
        slackTeamId: params.teamId ?? null,
      },
      update: {
        ...base,
        slackTeamName: params.teamName ?? undefined,
        slackTeamId: params.teamId ?? undefined,
      },
    })
  }

  return prisma.integration.upsert({
    where: {
      organizationId_provider: {
        organizationId,
        provider: "linear",
      },
    },
    create: {
      organizationId,
      provider: "linear",
      ...base,
      linearTeamName: params.teamName ?? null,
      linearTeamId: params.teamId ?? null,
    },
    update: {
      ...base,
      linearTeamName: params.teamName ?? undefined,
      linearTeamId: params.teamId ?? undefined,
    },
  })
}

export async function disconnectIntegration(provider: IntegrationProvider) {
  try {
    const parsed = integrationProviderSchema.safeParse(provider)
    if (!parsed.success) {
      return { success: false as const, error: "Invalid provider" }
    }

    const userId = await requireSessionUserId()
    const organizationId = await getOrganizationIdForUser(userId)
    if (!organizationId) {
      return { success: false as const, error: "No organization found" }
    }

    const existing = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: parsed.data,
        },
      },
    })

    if (!existing) {
      return { success: true as const }
    }

    if (existing.composioConnectedAccountId && isComposioConfigured()) {
      try {
        await deleteComposioConnectedAccount(existing.composioConnectedAccountId)
      } catch (error) {
        // Still deactivate locally if Composio revoke fails
        console.error("Composio disconnect failed:", error)
      }
    }

    await prisma.integration.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        composioConnectedAccountId: null,
        // keep channel/team preferences for reconnect
      },
    })

    revalidatePath("/dashboard/integrations", "page")
    revalidatePath("/dashboard/settings", "page")
    return { success: true as const }
  } catch (error) {
    console.error("disconnectIntegration failed:", error)
    return { success: false as const, error: "Failed to disconnect integration" }
  }
}

export async function updateSlackChannel(channelId: string | null) {
  try {
    const userId = await requireSessionUserId()
    const organizationId = await getOrganizationIdForUser(userId)
    if (!organizationId) {
      return { success: false as const, error: "No organization found" }
    }

    const existing = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: "slack",
        },
      },
    })

    if (!existing?.isActive || !existing.composioConnectedAccountId) {
      return { success: false as const, error: "Slack is not connected" }
    }

    await prisma.integration.update({
      where: { id: existing.id },
      data: { slackChannelId: channelId || null },
    })

    revalidatePath("/dashboard/integrations", "page")
    revalidatePath("/dashboard/settings", "page")
    return { success: true as const }
  } catch (error) {
    console.error("updateSlackChannel failed:", error)
    return { success: false as const, error: "Failed to update Slack channel" }
  }
}

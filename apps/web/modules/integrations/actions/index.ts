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
import { getLinearTeamsForConnectedAccount } from "../lib/linear"
import type { IntegrationProvider, IntegrationStatus } from "./schema"
import {
  integrationProviderSchema,
  updateLinearConfigSchema,
} from "./schema"

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

export type LinearTeamOption = {
  id: string
  name: string | null
}

/**
 * List Linear teams (workspaces) for the connected org account.
 * Used after first connect so the user can choose where supercodeAI lives.
 */
export async function listLinearTeams(): Promise<{
  success: true
  teams: LinearTeamOption[]
  selectedTeamId: string | null
} | {
  success: false
  error: string
}> {
  try {
    const userId = await requireSessionUserId()
    const organizationId = await getOrganizationIdForUser(userId)
    if (!organizationId) {
      return { success: false, error: "No organization found" }
    }
    if (!isComposioConfigured()) {
      return { success: false, error: "COMPOSIO_API_KEY is not configured" }
    }

    const existing = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId,
          provider: "linear",
        },
      },
    })

    if (!existing?.isActive || !existing.composioConnectedAccountId) {
      return { success: false, error: "Linear is not connected" }
    }

    const entityId =
      existing.composioEntityId || composioEntityIdForOrg(organizationId)
    const teams = await getLinearTeamsForConnectedAccount({
      entityId,
      connectedAccountId: existing.composioConnectedAccountId,
    })

    return {
      success: true,
      teams,
      selectedTeamId: existing.linearTeamId ?? null,
    }
  } catch (error) {
    console.error("listLinearTeams failed:", error)
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to list Linear teams",
    }
  }
}

export async function updateLinearTeam(
  teamId: string | null,
  teamName?: string | null,
) {
  try {
    const parsed = updateLinearConfigSchema.safeParse({
      teamId,
      teamName: teamName ?? null,
    })
    if (!parsed.success) {
      return { success: false as const, error: "Invalid team selection" }
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
          provider: "linear",
        },
      },
    })

    if (!existing?.isActive || !existing.composioConnectedAccountId) {
      return { success: false as const, error: "Linear is not connected" }
    }

    const nextTeamId = parsed.data.teamId ?? null
    const nextTeamName = parsed.data.teamName ?? null

// Keep supercodeAiProjectId only if team unchanged; otherwise clear so
    // notify recreates/finds project under the newly selected team.
    const prevConfig =
      existing.config &&
      typeof existing.config === "object" &&
      !Array.isArray(existing.config)
        ? { ...(existing.config as Record<string, unknown>) }
        : ({} as Record<string, unknown>)
    const teamChanged =
      Boolean(nextTeamId) && nextTeamId !== existing.linearTeamId
    const nextConfig: Record<string, unknown> = { ...prevConfig }

    if (nextTeamId) {
      nextConfig.supercodeAiTeamId = nextTeamId
    }
    if (teamChanged) {
      delete nextConfig.supercodeAiProjectId
    }

await prisma.integration.update({
      where: { id: existing.id },
      data: {
        linearTeamId: nextTeamId,
        linearTeamName: nextTeamName,
        // Prisma Json input rejects plain Record<string, unknown>
        config: nextConfig as object,
      },
    })

    revalidatePath("/dashboard/integrations", "page")
    revalidatePath("/dashboard/settings", "page")
    return { success: true as const }
  } catch (error) {
    console.error("updateLinearTeam failed:", error)
    return { success: false as const, error: "Failed to update Linear team" }
  }
}

import prisma from "@super/db"

import { ensureUserOrganization } from "./org"
import {
  COMPOSIO_TOOLKIT,
  deleteComposioConnectedAccount,
  executeComposioTool,
  getComposio,
} from "./composio"
import { beginProviderConnect } from "./connect-flow"
import { integrationProviderSchema, type IntegrationProvider } from "../actions/schema"

const READ_ONLY_TOOL_PATTERN = /(^|_)(CHECK|DESCRIBE|DOWNLOAD|FETCH|FIND|GET|LIST|LOOKUP|QUERY|READ|RETRIEVE|SEARCH|VIEW)(_|$)/i

async function organizationContext(userId: string) {
  const organizationId = await ensureUserOrganization(userId)
  return { organizationId, entityId: `org_${organizationId}` }
}

export async function listDesktopComposioApps(userId: string) {
  const { organizationId } = await organizationContext(userId)
  const composio = getComposio()
  const [toolkits, integrations] = await Promise.all([
    composio.toolkits.get(),
    prisma.integration.findMany({
      where: {
        organizationId,
        provider: { in: ["slack", "linear", "github"] },
        isActive: true,
        composioConnectedAccountId: { not: null },
      },
    }),
  ])
  const connected = new Map(
    integrations.flatMap((item) => item.composioConnectedAccountId
      ? [[item.provider, item.composioConnectedAccountId] as const]
      : []),
  )
  const supported = new Set(Object.values(COMPOSIO_TOOLKIT))
  return (toolkits as Array<{
    slug: string
    name: string
    meta?: { description?: string; logo?: string | null }
  }>)
    .filter((toolkit) => supported.has(toolkit.slug))
    .map((toolkit) => ({
      slug: toolkit.slug,
      name: toolkit.name,
      description: toolkit.meta?.description ?? "",
      logo: toolkit.meta?.logo ?? null,
      connected: connected.has(toolkit.slug),
      connectedAccountId: connected.get(toolkit.slug) ?? null,
    }))
    .sort((a, b) => a.connected === b.connected
      ? a.name.localeCompare(b.name)
      : a.connected ? -1 : 1)
}

export async function beginDesktopComposioConnect(
  userId: string,
  slug: string,
  returnTo: "desktop" | "web" | "nova" = "desktop",
) {
  const provider = integrationProviderSchema.parse(slug)
  return beginProviderConnect({ userId, provider, returnTo })
}

export async function disconnectDesktopComposio(userId: string, connectedAccountId: string) {
  const { organizationId } = await organizationContext(userId)
  const integration = await prisma.integration.findFirst({
    where: { organizationId, composioConnectedAccountId: connectedAccountId, isActive: true },
  })
  if (!integration) throw Object.assign(new Error("Connected account not found"), { statusCode: 404 })
  await deleteComposioConnectedAccount(connectedAccountId)
  await prisma.integration.update({
    where: { id: integration.id },
    data: { isActive: false, composioConnectedAccountId: null },
  })
}

async function activeIntegrations(userId: string) {
  const { organizationId, entityId } = await organizationContext(userId)
  const integrations = await prisma.integration.findMany({
    where: {
      organizationId,
      provider: { in: ["slack", "linear", "github"] },
      isActive: true,
      composioConnectedAccountId: { not: null },
    },
  })
  return { entityId, integrations }
}

export async function listDesktopComposioTools(userId: string) {
  const { integrations } = await activeIntegrations(userId)
  const composio = getComposio()
  const tools = [] as Array<Record<string, unknown>>
  const seen = new Set<string>()
  for (const integration of integrations) {
    const raw = await composio.tools.getRawComposioTools({ toolkits: [integration.provider] })
    for (const tool of raw) {
      if (tool.isDeprecated || seen.has(tool.slug)) continue
      seen.add(tool.slug)
      tools.push({
        name: tool.slug,
        displayName: tool.name,
        description: tool.description || tool.name,
        parameters: tool.inputParameters ?? { type: "object", properties: {} },
        toolkit: tool.toolkit?.slug ?? integration.provider,
        toolkitName: tool.toolkit?.name ?? integration.provider,
        requiresApproval: !READ_ONLY_TOOL_PATTERN.test(tool.slug),
      })
    }
  }
  return tools
}

export async function executeDesktopComposioTool(input: {
  userId: string
  toolName: string
  arguments: Record<string, unknown>
}) {
  const { entityId, integrations } = await activeIntegrations(input.userId)
  const composio = getComposio()
  const raw = await composio.tools.getRawComposioTools({ tools: [input.toolName] })
  const tool = raw.find((candidate) => candidate.slug === input.toolName && !candidate.isDeprecated)
  const provider = integrationProviderSchema.safeParse(tool?.toolkit?.slug)
  if (!tool || !provider.success) {
    throw Object.assign(new Error("Composio tool not found"), { statusCode: 404 })
  }
  const integration = integrations.find((item) => item.provider === provider.data)
  if (!integration?.composioConnectedAccountId) {
    throw Object.assign(new Error(`Connect ${provider.data} before using this tool`), { statusCode: 403 })
  }
  return executeComposioTool({
    toolSlug: input.toolName,
    userId: entityId,
    connectedAccountId: integration.composioConnectedAccountId,
    arguments: input.arguments,
  })
}

export async function createDesktopComposioSession(userId: string) {
  const { entityId, integrations } = await activeIntegrations(userId)
  const connectedAccounts = Object.fromEntries(
    integrations.flatMap((item) => item.composioConnectedAccountId
      ? [[item.provider, item.composioConnectedAccountId]]
      : []),
  )
  const session = await getComposio().sessions.create(entityId, {
    mcp: true,
    connectedAccounts,
  })
  const sessionData = session as unknown as {
    mcp: { url: string; headers: Record<string, string> }
    session_id: string
  }
  return {
    url: sessionData.mcp.url,
    headers: sessionData.mcp.headers,
    sessionId: sessionData.session_id,
  }
}

export function providerForToolkit(slug: string): IntegrationProvider {
  return integrationProviderSchema.parse(slug)
}

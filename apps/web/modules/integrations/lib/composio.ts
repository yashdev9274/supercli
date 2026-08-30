import { Composio } from "@composio/core"
import type { IntegrationProvider } from "../actions/schema"
import { getAppBaseUrl } from "./app-url"

export const COMPOSIO_TOOLKIT: Record<IntegrationProvider, string> = {
  slack: "slack",
  linear: "linear",
}

/**
 * Composio requires an explicit toolkit version on tools.execute (TS-SDK::TOOL_VERSION_REQUIRED).
 * Prefer COMPOSIO_TOOLKIT_VERSION_<SLUG>, then COMPOSIO_TOOLKIT_VERSION, then "latest".
 */
export function resolveComposioToolkitVersion(toolkitSlug: string): string {
  const slug = toolkitSlug.trim().toLowerCase()
  const envKey = `COMPOSIO_TOOLKIT_VERSION_${slug.replace(/[^a-z0-9]+/g, "_").toUpperCase()}`
  return (
    process.env[envKey]?.trim() ||
    process.env.COMPOSIO_TOOLKIT_VERSION?.trim() ||
    "latest"
  )
}

function toolkitVersionsFromEnv(): Record<string, string> {
  const versions: Record<string, string> = {}
  for (const slug of Object.values(COMPOSIO_TOOLKIT)) {
    versions[slug] = resolveComposioToolkitVersion(slug)
  }
  return versions
}

function toolkitSlugFromToolSlug(toolSlug: string): string | null {
  const upper = toolSlug.trim().toUpperCase()
  for (const slug of Object.values(COMPOSIO_TOOLKIT)) {
    if (upper.startsWith(`${slug.toUpperCase()}_`)) return slug
  }
  const head = toolSlug.split("_")[0]?.toLowerCase()
  return head || null
}

let composioSingleton: Composio | null = null

export function isComposioConfigured(): boolean {
  return Boolean(process.env.COMPOSIO_API_KEY?.trim())
}

export function getComposio(): Composio {
  const apiKey = process.env.COMPOSIO_API_KEY?.trim()
  if (!apiKey) {
    throw new Error("COMPOSIO_API_KEY is not configured")
  }
  if (!composioSingleton) {
    composioSingleton = new Composio({
      apiKey,
      // SDK-level defaults; execute still passes version explicitly for safety.
      toolkitVersions: toolkitVersionsFromEnv(),
    })
  }
  return composioSingleton
}

/**
 * Composio entity id for org-scoped connections.
 * One Slack/Linear connection per organization.
 */
export function composioEntityIdForOrg(organizationId: string): string {
  return `org_${organizationId}`
}

function authConfigIdFor(provider: IntegrationProvider): string | undefined {
  if (provider === "slack") {
    return process.env.COMPOSIO_SLACK_AUTH_CONFIG_ID?.trim() || undefined
  }
  return process.env.COMPOSIO_LINEAR_AUTH_CONFIG_ID?.trim() || undefined
}

export type ComposioConnectStart = {
  redirectUrl: string
  connectionRequestId: string
}

function isAuthConfigNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const e = error as {
    code?: string | number
    slug?: string
    error?: {
      code?: string | number
      slug?: string
      message?: string
      error_code?: string
      status?: number
    }
    message?: string
    status?: number
    cause?: unknown
  }

  const markers = [
    e.code,
    e.slug,
    e.error?.code,
    e.error?.slug,
    e.error?.error_code,
  ]
    .filter((v) => v !== undefined && v !== null)
    .map((c) => String(c))

  const message = `${e.message || ""} ${e.error?.message || ""}`.toLowerCase()
  const nested =
    e.cause && typeof e.cause === "object"
      ? isAuthConfigNotFoundError(e.cause)
      : false

  return (
    nested ||
    markers.includes("Auth_Config_NotFound") ||
    message.includes("auth config notfound") ||
    message.includes("auth_config_notfound") ||
    message.includes("auth config not found")
  )
}

function formatComposioError(error: unknown): string {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : String(error)
  }
  const e = error as {
    message?: string
    code?: string | number
    slug?: string
    error?: {
      message?: string
      code?: string | number
      slug?: string
      request_id?: string
    }
    requestId?: string
  }
  const parts = [
    e.error?.message || e.message,
    e.error?.slug || e.slug || e.error?.code || e.code,
    e.error?.request_id || e.requestId
      ? `request_id=${e.error?.request_id || e.requestId}`
      : null,
  ].filter(Boolean)
  return parts.join(" | ") || "unknown Composio error"
}

async function linkWithAuthConfig(params: {
  composio: Composio
  entityId: string
  authConfigId: string
  callbackUrl: string
}): Promise<ComposioConnectStart> {
  const req = await params.composio.connectedAccounts.link(
    params.entityId,
    params.authConfigId,
    { callbackUrl: params.callbackUrl },
  )
  const redirectUrl = (req as { redirectUrl?: string | null }).redirectUrl
  if (!redirectUrl) {
    throw new Error("Composio did not return a redirect URL")
  }
  return {
    redirectUrl,
    connectionRequestId: (req as { id: string }).id,
  }
}

/**
 * Find an existing auth config for the toolkit, or create a Composio-managed one.
 * Needed so connectedAccounts.link can pass our callbackUrl (toolkits.authorize cannot).
 */
async function resolveManagedAuthConfigId(params: {
  composio: Composio
  toolkit: string
  provider: IntegrationProvider
}): Promise<string> {
  const authConfigs = params.composio.authConfigs as unknown as {
    list: (query?: Record<string, unknown>) => Promise<{
      items?: Array<{
        id?: string
        nanoid?: string
        status?: string
        isDisabled?: boolean
        toolkit?: { slug?: string }
        appName?: string
        name?: string
      }>
    }>
    create: (
      toolkit: string,
      options?: Record<string, unknown>,
    ) => Promise<{ id?: string; nanoid?: string; authConfig?: { id?: string } }>
  }

  try {
    const listed = await authConfigs.list({
      toolkit: params.toolkit,
      showDisabled: false,
    })
    const active = (listed.items ?? []).find((item) => {
      const id = item.id || item.nanoid
      if (!id) return false
      if (item.isDisabled === true || item.status === "DISABLED") return false
      const slug = (item.toolkit?.slug || item.appName || "").toLowerCase()
      return !slug || slug === params.toolkit
    })
    const existingId = active?.id || active?.nanoid
    if (existingId) return existingId
  } catch (error) {
    console.warn(
      `[composio] list auth configs for ${params.toolkit} failed; will try create:`,
      formatComposioError(error),
    )
  }

  const created = await authConfigs.create(params.toolkit, {
    type: "use_composio_managed_auth",
    name: `Supercode ${params.provider} (managed)`,
  })
  const createdId =
    created.id || created.nanoid || created.authConfig?.id
  if (!createdId) {
    throw new Error(
      `Composio authConfigs.create(${params.toolkit}) returned no id`,
    )
  }
  console.info(
    `[composio] created managed auth config ${createdId} for ${params.provider}; set COMPOSIO_${params.provider.toUpperCase()}_AUTH_CONFIG_ID=${createdId} to reuse it`,
  )
  return createdId
}

async function authorizeViaToolkit(params: {
  composio: Composio
  entityId: string
  toolkit: string
}): Promise<ComposioConnectStart> {
  const authorize = (
    params.composio as unknown as {
      toolkits: {
        authorize: (
          userId: string,
          toolkitSlug: string,
          authConfigId?: string,
        ) => Promise<{ id: string; redirectUrl: string | null }>
      }
    }
  ).toolkits.authorize

  const req = await authorize(params.entityId, params.toolkit)
  if (!req.redirectUrl) {
    throw new Error(
      "Composio authorize returned no redirect URL (account may already be connected)",
    )
  }

  return {
    redirectUrl: req.redirectUrl,
    connectionRequestId: req.id,
  }
}

/**
 * Start Composio hosted OAuth for Slack or Linear.
 * 1) Env auth config id + link (custom OAuth)
 * 2) Resolve/create managed auth config + link (keeps our callbackUrl)
 * 3) toolkits.authorize last resort (may not hit our callback)
 */
export async function startComposioConnect(params: {
  provider: IntegrationProvider
  organizationId: string
  callbackUrl: string
}): Promise<ComposioConnectStart> {
  const composio = getComposio()
  const entityId = composioEntityIdForOrg(params.organizationId)
  const toolkit = COMPOSIO_TOOLKIT[params.provider]
  const envAuthConfigId = authConfigIdFor(params.provider)

  if (envAuthConfigId) {
    try {
      return await linkWithAuthConfig({
        composio,
        entityId,
        authConfigId: envAuthConfigId,
        callbackUrl: params.callbackUrl,
      })
    } catch (error) {
      if (!isAuthConfigNotFoundError(error)) {
        throw new Error(
          `Composio link failed for ${params.provider}: ${formatComposioError(error)}`,
          { cause: error },
        )
      }
      console.warn(
        `[composio] ${params.provider} auth config "${envAuthConfigId}" not found; resolving managed auth config. Fix or unset COMPOSIO_${params.provider.toUpperCase()}_AUTH_CONFIG_ID.`,
        formatComposioError(error),
      )
    }
  }

  try {
    const managedAuthConfigId = await resolveManagedAuthConfigId({
      composio,
      toolkit,
      provider: params.provider,
    })
    return await linkWithAuthConfig({
      composio,
      entityId,
      authConfigId: managedAuthConfigId,
      callbackUrl: params.callbackUrl,
    })
  } catch (managedError) {
    console.warn(
      `[composio] managed auth config/link failed for ${params.provider}; falling back to toolkit.authorize:`,
      formatComposioError(managedError),
    )
  }

  try {
    return await authorizeViaToolkit({
      composio,
      entityId,
      toolkit,
    })
  } catch (error) {
    throw new Error(
      `Composio authorize failed for ${params.provider}: ${formatComposioError(error)}`,
      { cause: error },
    )
  }
}

export type ComposioAccountSummary = {
  id: string
  status: string
  toolkitSlug: string | null
  // Best-effort display metadata when Composio returns it
  displayName: string | null
}

export async function getComposioConnectedAccount(
  connectedAccountId: string,
): Promise<ComposioAccountSummary | null> {
  const composio = getComposio()
  try {
    const acct = (await composio.connectedAccounts.get(connectedAccountId)) as {
      id?: string
      status?: string
      toolkit?: { slug?: string }
      // various shapes across SDK versions
      data?: { appName?: string; name?: string }
      params?: Record<string, unknown>
    }
    if (!acct?.id) return null
    const displayName =
      (typeof acct.data?.name === "string" && acct.data.name) ||
      (typeof acct.data?.appName === "string" && acct.data.appName) ||
      null
    return {
      id: acct.id,
      status: acct.status || "UNKNOWN",
      toolkitSlug: acct.toolkit?.slug ?? null,
      displayName,
    }
  } catch (error) {
    console.error("getComposioConnectedAccount failed:", error)
    return null
  }
}

export async function listActiveComposioAccountsForEntity(
  entityId: string,
): Promise<ComposioAccountSummary[]> {
  const composio = getComposio()
  try {
    const res = (await (composio.connectedAccounts as unknown as {
      list: (opts: Record<string, unknown>) => Promise<{ items?: unknown[] }>
    }).list({ userIds: [entityId] })) as {
      items?: Array<{
        id: string
        status: string
        toolkit?: { slug?: string }
        userId?: string
      }>
    }

    return (res.items ?? [])
      .filter((a) => a.status === "ACTIVE")
      .map((a) => ({
        id: a.id,
        status: a.status,
        toolkitSlug: a.toolkit?.slug ?? null,
        displayName: null,
      }))
  } catch (error) {
    // Fallback: list all and filter client-side if userIds filter unsupported
    console.error("listActiveComposioAccountsForEntity failed, trying bare list:", error)
    try {
      const res = (await composio.connectedAccounts.list({})) as {
        items?: Array<{
          id: string
          status: string
          toolkit?: { slug?: string }
          userId?: string
          entityId?: string
        }>
      }
      return (res.items ?? [])
        .filter(
          (a) =>
            a.status === "ACTIVE" &&
            (a.userId === entityId || a.entityId === entityId),
        )
        .map((a) => ({
          id: a.id,
          status: a.status,
          toolkitSlug: a.toolkit?.slug ?? null,
          displayName: null,
        }))
    } catch (err2) {
      console.error("listActiveComposioAccountsForEntity bare list failed:", err2)
      return []
    }
  }
}

export async function deleteComposioConnectedAccount(
  connectedAccountId: string,
): Promise<void> {
  const composio = getComposio()
  const accounts = composio.connectedAccounts as unknown as {
    delete?: (id: string) => Promise<unknown>
    disable?: (id: string) => Promise<unknown>
  }
  if (typeof accounts.delete === "function") {
    await accounts.delete(connectedAccountId)
    return
  }
  if (typeof accounts.disable === "function") {
    await accounts.disable(connectedAccountId)
    return
  }
  throw new Error("Composio SDK cannot delete/disable connected accounts")
}

/**
 * Execute a Composio tool for a connected account (Phase 2+ notifications).
 * Always passes toolkit `version` to satisfy TS-SDK::TOOL_VERSION_REQUIRED.
 */
export async function executeComposioTool(params: {
  toolSlug: string
  userId: string // composio entity id
  arguments: Record<string, unknown>
  connectedAccountId?: string
  /** Override toolkit version; defaults from env / "latest". */
  version?: string
}) {
  const composio = getComposio()
  const toolkitSlug = toolkitSlugFromToolSlug(params.toolSlug)
  const version =
    params.version?.trim() ||
    (toolkitSlug
      ? resolveComposioToolkitVersion(toolkitSlug)
      : process.env.COMPOSIO_TOOLKIT_VERSION?.trim() || "latest")

  return composio.tools.execute(params.toolSlug, {
    userId: params.userId,
    arguments: params.arguments,
    version,
    ...(params.connectedAccountId
      ? { connectedAccountId: params.connectedAccountId }
      : {}),
  } as never)
}

export function getProviderCallbackUrl(
  provider: IntegrationProvider,
  extra?: Record<string, string>,
): string {
  const url = new URL(`${getAppBaseUrl()}/api/integrations/${provider}/callback`)
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      url.searchParams.set(k, v)
    }
  }
  return url.toString()
}

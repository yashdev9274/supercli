import { Composio } from "@composio/core"

const READ_ONLY_TOOL_PATTERN = /(^|_)(CHECK|DESCRIBE|DOWNLOAD|FETCH|FIND|GET|LIST|LOOKUP|QUERY|READ|RETRIEVE|SEARCH|VIEW)(_|$)/i

export class ServerComposioService {
  constructor(private client?: Composio) {}

  private get composio(): Composio {
    if (this.client) return this.client
    const apiKey = process.env.COMPOSIO_API_KEY?.trim()
    if (!apiKey) {
      throw Object.assign(new Error("COMPOSIO_API_KEY is not configured on the CLI server"), {
        statusCode: 503,
      })
    }
    this.client = new Composio({ apiKey })
    return this.client
  }

  private async activeAccounts(userId: string) {
    const accounts = [] as Awaited<ReturnType<Composio["connectedAccounts"]["list"]>>["items"]
    let cursor: string | undefined
    do {
      const page = await this.composio.connectedAccounts.list({
        userIds: [userId],
        statuses: ["ACTIVE"],
        accountType: "PRIVATE",
        cursor,
        limit: 100,
      })
      accounts.push(...page.items.filter((account) => account.status === "ACTIVE" && !account.isDisabled))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    return accounts
  }

  private async authConfigs(toolkit?: string) {
    const configs = [] as Awaited<ReturnType<Composio["authConfigs"]["list"]>>["items"]
    let cursor: string | undefined
    do {
      const page = await this.composio.authConfigs.list({ toolkit, showDisabled: false, cursor, limit: 100 })
      configs.push(...page.items.filter((config) => config.status === "ENABLED"))
      cursor = page.nextCursor ?? undefined
    } while (cursor)
    return configs
  }

  async listApps(userId: string) {
    const [toolkits, configs, accounts] = await Promise.all([
      this.composio.toolkits.get(),
      this.authConfigs(),
      this.activeAccounts(userId),
    ])
    const configured = new Set(configs.map((config) => config.toolkit.slug))
    const connected = new Map(accounts.map((account) => [account.toolkit.slug, account.id]))
    return toolkits
      .filter((toolkit) => configured.has(toolkit.slug) || connected.has(toolkit.slug))
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

  async createSession(userId: string) {
    const accounts = await this.activeAccounts(userId)
    const connectedAccounts = Object.fromEntries(accounts.map((account) => [account.toolkit.slug, account.id]))
    const session = await this.composio.sessions.create(userId, {
      mcp: true,
      connectedAccounts,
      toolkits: Object.keys(connectedAccounts),
      manageConnections: false,
    })
    return {
      url: session.mcp.url,
      headers: session.mcp.headers,
      sessionId: session.sessionId,
    }
  }

  async connect(userId: string, slug: string, callbackUrl: string) {
    const accounts = await this.activeAccounts(userId)
    const existing = accounts.find((account) => account.toolkit.slug === slug)
    if (existing) return { connectedAccountId: existing.id, redirectUrl: null }

    const configs = await this.authConfigs(slug)
    const envId = process.env[`COMPOSIO_${slug.toUpperCase()}_AUTH_CONFIG_ID`]?.trim()
    const config = configs.find((candidate) => candidate.id === envId)
      ?? configs.find((candidate) => candidate.toolkit.slug === slug)
    const configId = config?.id ?? (await this.composio.authConfigs.create(slug, {
      type: "use_composio_managed_auth",
      name: `Supercode ${slug}`,
    })).id
    const connection = await this.composio.connectedAccounts.link(userId, configId, { callbackUrl })
    if (!connection.redirectUrl) throw new Error("Composio did not return an authorization URL")
    return { connectedAccountId: connection.id, redirectUrl: connection.redirectUrl }
  }

  async verifyConnection(userId: string, slug: string, connectedAccountId: string) {
    const accounts = await this.activeAccounts(userId)
    return accounts.some((account) => account.id === connectedAccountId && account.toolkit.slug === slug)
  }

  async disconnect(userId: string, connectedAccountId: string) {
    const accounts = await this.activeAccounts(userId)
    if (!accounts.some((account) => account.id === connectedAccountId)) {
      throw Object.assign(new Error("Connected account not found"), { statusCode: 404 })
    }
    await this.composio.connectedAccounts.delete(connectedAccountId)
  }

  async listTools(userId: string) {
    const accounts = await this.activeAccounts(userId)
    const toolkits = [...new Set(accounts.map((account) => account.toolkit.slug))]
    if (toolkits.length === 0) return []
    const raw = await this.composio.tools.getRawComposioTools({ toolkits })
    return raw.filter((tool) => !tool.isDeprecated && tool.toolkit && toolkits.includes(tool.toolkit.slug)).map((tool) => ({
      name: tool.slug,
      displayName: tool.name,
      description: tool.description || tool.name,
      parameters: tool.inputParameters ?? { type: "object", properties: {} },
      toolkit: tool.toolkit?.slug,
      toolkitName: tool.toolkit?.name,
      requiresApproval: !READ_ONLY_TOOL_PATTERN.test(tool.slug),
    }))
  }

  async executeTool(userId: string, name: string, args: Record<string, unknown>) {
    const tools = await this.composio.tools.getRawComposioTools({ tools: [name] })
    const tool = tools.find((candidate) => candidate.slug === name && !candidate.isDeprecated)
    if (!tool?.toolkit) throw Object.assign(new Error("Composio tool not found"), { statusCode: 404 })
    const toolkit = tool.toolkit.slug
    const accounts = await this.activeAccounts(userId)
    const account = accounts.find((candidate) => candidate.toolkit.slug === toolkit)
    if (!account) {
      throw Object.assign(new Error(`Connect ${toolkit} before using this tool`), { statusCode: 403 })
    }
    const version = process.env[`COMPOSIO_TOOLKIT_VERSION_${toolkit.toUpperCase()}`]?.trim()
      || process.env.COMPOSIO_TOOLKIT_VERSION?.trim()
      || "latest"
    return this.composio.tools.execute(name, {
      userId,
      connectedAccountId: account.id,
      arguments: args,
      version,
    })
  }
}

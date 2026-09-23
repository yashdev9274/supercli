import type { Express, Request } from "express"

type AuthenticatedUser = { id: string }
type Authenticate = (req: Request) => Promise<AuthenticatedUser | null>

const READ_ONLY_TOOL_PATTERN = /(^|_)(CHECK|DESCRIBE|DOWNLOAD|FETCH|FIND|GET|LIST|LOOKUP|QUERY|READ|RETRIEVE|SEARCH|VIEW)(_|$)/i

function userId(id: string): string {
  return `user_${id}`
}

function getApiKey(): string {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) throw new Error("Composio not configured on server")
  return apiKey
}

async function getClient() {
  const { Composio } = await import("@composio/core")
  return new Composio({ apiKey: getApiKey() })
}

async function activeAccounts(composio: any, id: string): Promise<any[]> {
  const response = await composio.connectedAccounts.list({
    userIds: [userId(id)],
    statuses: ["ACTIVE"],
    limit: 100,
  })
  return response.items ?? []
}

async function requireUser(req: Request, authenticate: Authenticate) {
  const user = await authenticate(req)
  if (!user) throw Object.assign(new Error("Unauthorized"), { statusCode: 401 })
  return user
}

function sendError(res: any, error: unknown, fallback: string) {
  const value = error as { message?: string; statusCode?: number }
  res.status(value.statusCode ?? 500).json({ error: value.message || fallback })
}

export function registerComposioRoutes(app: Express, authenticate: Authenticate): void {
  app.post("/api/composio/session", async (req, res) => {
    try {
      const user = await requireUser(req, authenticate)
      const composio = await getClient()
      const accounts = await activeAccounts(composio, user.id)
      const connectedAccounts = Object.fromEntries(
        accounts.flatMap((account) => account.toolkit?.slug ? [[account.toolkit.slug, account.id]] : []),
      )
      const session = await composio.sessions.create(userId(user.id), {
        mcp: true,
        connectedAccounts,
      })

      res.json({
        url: (session as any).mcp.url,
        headers: (session as any).mcp.headers,
        sessionId: (session as any).session_id,
        // Kept for the existing CLI client. Desktop never stores or consumes it.
        apiKey: getApiKey(),
      })
    } catch (error) {
      sendError(res, error, "Composio session creation failed")
    }
  })

  app.post("/api/composio/apps", async (req, res) => {
    try {
      const user = await requireUser(req, authenticate)
      const composio = await getClient()
      const [authConfigs, toolkits, accounts] = await Promise.all([
        composio.authConfigs.list({}),
        composio.toolkits.get(),
        activeAccounts(composio, user.id),
      ])
      const configuredSlugs = new Set<string>(
        (authConfigs.items ?? []).map((config: any) => config.toolkit?.slug).filter(Boolean),
      )
      const connectedMap = new Map<string, string>()
      for (const account of accounts) {
        if (account.toolkit?.slug) connectedMap.set(account.toolkit.slug, account.id)
      }

      const apps = (toolkits as any[])
        .filter((toolkit) => configuredSlugs.has(toolkit.slug))
        .map((toolkit) => ({
          slug: toolkit.slug,
          name: toolkit.name,
          description: toolkit.meta?.description ?? "",
          logo: toolkit.meta?.logo ?? null,
          connected: connectedMap.has(toolkit.slug),
          connectedAccountId: connectedMap.get(toolkit.slug) ?? null,
        }))
        .sort((a, b) => a.connected === b.connected
          ? a.name.localeCompare(b.name)
          : a.connected ? -1 : 1)

      res.json({ apps })
    } catch (error) {
      sendError(res, error, "Composio list apps failed")
    }
  })

  app.post("/api/composio/connect", async (req, res) => {
    try {
      const user = await requireUser(req, authenticate)
      const slug = typeof req.body?.slug === "string" ? req.body.slug.trim() : ""
      if (!slug) {
        res.status(400).json({ error: "A toolkit slug is required" })
        return
      }
      const composio = await getClient()
      const request = await composio.toolkits.authorize(userId(user.id), slug)
      res.json({
        connectedAccountId: request.id,
        redirectUrl: request.redirectUrl ?? null,
      })
    } catch (error) {
      sendError(res, error, "Composio connection failed")
    }
  })

  app.post("/api/composio/disconnect", async (req, res) => {
    try {
      const user = await requireUser(req, authenticate)
      const accountId = typeof req.body?.connectedAccountId === "string"
        ? req.body.connectedAccountId.trim()
        : ""
      if (!accountId) {
        res.status(400).json({ error: "A connected account ID is required" })
        return
      }
      const composio = await getClient()
      const accounts = await activeAccounts(composio, user.id)
      if (!accounts.some((account) => account.id === accountId)) {
        res.status(404).json({ error: "Connected account not found" })
        return
      }
      await composio.connectedAccounts.delete(accountId)
      res.json({ success: true })
    } catch (error) {
      sendError(res, error, "Composio disconnect failed")
    }
  })

  app.post("/api/composio/tools", async (req, res) => {
    try {
      const user = await requireUser(req, authenticate)
      const composio = await getClient()
      const accounts = await activeAccounts(composio, user.id)
      const toolkitSlugs = [...new Set<string>(accounts.map((account) => account.toolkit?.slug).filter(Boolean))]
      const seen = new Set<string>()
      const tools: any[] = []

      for (const slug of toolkitSlugs) {
        const rawTools = await composio.tools.getRawComposioTools({ toolkits: [slug] })
        for (const tool of rawTools) {
          if (tool.isDeprecated || seen.has(tool.slug)) continue
          seen.add(tool.slug)
          tools.push({
            name: tool.slug,
            displayName: tool.name,
            description: tool.description || tool.name,
            parameters: tool.inputParameters ?? { type: "object", properties: {} },
            toolkit: tool.toolkit?.slug ?? slug,
            toolkitName: tool.toolkit?.name ?? slug,
            requiresApproval: !READ_ONLY_TOOL_PATTERN.test(tool.slug),
          })
        }
      }

      res.json({ tools })
    } catch (error) {
      sendError(res, error, "Composio tools failed")
    }
  })

  app.post("/api/composio/execute", async (req, res) => {
    try {
      const user = await requireUser(req, authenticate)
      const toolName = typeof req.body?.toolName === "string" ? req.body.toolName.trim() : ""
      const args = req.body?.arguments
      if (!toolName || !args || typeof args !== "object" || Array.isArray(args)) {
        res.status(400).json({ error: "A tool name and arguments object are required" })
        return
      }

      const composio = await getClient()
      const rawTools = await composio.tools.getRawComposioTools({ tools: [toolName] })
      const tool = rawTools.find((candidate: any) => candidate.slug === toolName && !candidate.isDeprecated)
      const toolkitSlug = tool?.toolkit?.slug
      if (!tool || !toolkitSlug) {
        res.status(404).json({ error: "Composio tool not found" })
        return
      }
      const accounts = await activeAccounts(composio, user.id)
      const account = accounts.find((candidate) => candidate.toolkit?.slug === toolkitSlug)
      if (!account) {
        res.status(403).json({ error: `Connect ${tool.toolkit?.name ?? toolkitSlug} before using this tool` })
        return
      }

      const result = await composio.tools.execute(toolName, {
        connectedAccountId: account.id,
        userId: userId(user.id),
        arguments: args,
        dangerouslySkipVersionCheck: true,
      })
      res.json({
        data: result?.data ?? null,
        error: result?.error ?? null,
        successful: result?.successful ?? false,
      })
    } catch (error) {
      sendError(res, error, "Composio tool execution failed")
    }
  })
}

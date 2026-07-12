import { Composio } from "@composio/core"
import { getStoredToken } from "src/lib/token"

const BASE_URL = process.env.SUPERCODE_SERVER_URL || "https://supercode-8w7e.onrender.com"

export interface ComposioSessionInfo {
  url: string
  headers: Record<string, string>
  sessionId: string
}

export interface AppEntry {
  slug: string
  name: string
  description: string
  logo?: string
  connected: boolean
  connectedAccountId?: string
}

export class ComposioSessionManager {
  private composio: Composio | null = null
  private session: ComposioSessionInfo | null = null

  constructor() {
    const apiKey = process.env.COMPOSIO_API_KEY
    if (apiKey) {
      try {
        this.composio = new Composio({ apiKey })
      } catch {
        // composio init failed — not configured
      }
    }
  }

  get isConfigured(): boolean {
    return this.composio !== null
  }

  get isConnected(): boolean {
    return this.session !== null
  }

  get connectionInfo(): ComposioSessionInfo | null {
    return this.session
  }

  getClient(): Composio {
    if (!this.composio) {
      throw new Error("COMPOSIO_API_KEY not configured")
    }
    return this.composio
  }

  async createSessionFromServer(
    serverUrl = BASE_URL,
    accessToken?: string,
  ): Promise<ComposioSessionInfo> {
    if (!accessToken) {
      const stored = await getStoredToken()
      accessToken = stored?.access_token as string
    }
    if (!accessToken) {
      throw new Error("Not authenticated — run supercode login first")
    }

    const res = await fetch(`${serverUrl}/api/composio/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error((body as any).error || `Server returned ${res.status}`)
    }

    const info = (await res.json()) as ComposioSessionInfo
    this.session = info
    return info
  }

  async createSession(userId = "default"): Promise<ComposioSessionInfo> {
    if (!this.composio) {
      throw new Error("COMPOSIO_API_KEY not configured")
    }

    const connectedIds = await this.listConnectedAccountIds()

    const s = await this.composio.sessions.create(userId, {
      mcp: true,
      connectedAccounts: connectedIds,
    })

    const info: ComposioSessionInfo = {
      url: (s as any).mcp.url as string,
      headers: (s as any).mcp.headers as Record<string, string>,
      sessionId: (s as any).session_id as string,
    }

    this.session = info
    return info
  }

  private async listConnectedAccountIds(): Promise<Record<string, string>> {
    const c = this.getClient()
    const res = await (c.connectedAccounts as any).list({}) as { items: any[] }
    const result: Record<string, string> = {}
    for (const acct of res.items ?? []) {
      if (acct.status === "ACTIVE") {
        result[acct.toolkit?.slug] = acct.id
      }
    }
    return result
  }

  resetSession(): void {
    this.session = null
  }

  async listApps(): Promise<AppEntry[]> {
    const c = this.getClient()

    const [authConfigs, toolkits, connectedRes] = await Promise.all([
      (c as any).authConfigs.list({}) as Promise<{ items: any[] }>,
      (c.toolkits as any).get() as Promise<any[]>,
      (c.connectedAccounts as any).list({}) as Promise<{ items: any[] }>,
    ])

    const configuredSlugs = new Set(
      (authConfigs.items ?? []).map((ac: any) => ac.toolkit?.slug).filter(Boolean),
    )

    const connectedMap = new Map<string, { id: string; status: string }>()
    for (const acct of connectedRes.items ?? []) {
      const slug = acct.toolkit?.slug
      if (slug && acct.status === "ACTIVE") {
        connectedMap.set(slug, { id: acct.id, status: acct.status })
      }
    }

    const toolkitMap = new Map<string, any>()
    for (const tk of toolkits) {
      toolkitMap.set(tk.slug, tk)
    }

    const apps: AppEntry[] = []

    for (const slug of configuredSlugs) {
      const tk = toolkitMap.get(slug)
      if (!tk) continue

      const conn = connectedMap.get(slug)
      apps.push({
        slug: tk.slug,
        name: tk.name,
        description: tk.meta?.description ?? "",
        logo: tk.meta?.logo,
        connected: conn?.status === "ACTIVE",
        connectedAccountId: conn?.id,
      })
    }

    apps.sort((a, b) => {
      if (a.connected !== b.connected) return a.connected ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    return apps
  }

  async listConnectedAccounts(): Promise<{ slug: string; name: string; id: string }[]> {
    const c = this.getClient()
    const res = await (c.connectedAccounts as any).list({}) as { items: any[] }
    return (res.items ?? [])
      .filter((a: any) => a.status === "ACTIVE")
      .map((a: any) => ({
        slug: a.toolkit.slug,
        name: a.toolkit.slug,
        id: a.id,
      }))
  }

  async connectApp(
    slug: string,
    userId = "default",
  ): Promise<{ connectedAccountId: string; redirectUrl: string | null; waitForActive(): Promise<void> }> {
    const c = this.getClient()
    const req: any = await (c.toolkits as any).authorize(userId, slug)

    return {
      connectedAccountId: req.id,
      redirectUrl: req.redirectUrl,
      waitForActive: async () => {
        await req.waitForConnection()
      },
    }
  }
}

export const composioSessionManager = new ComposioSessionManager()

import type { McpServerConfig } from "src/mcp/mcp-manager.ts"
import type { ConnectorEntry, ConnectorSession } from "./types.ts"

/**
 * Merge Agent Handler auto-connector.
 *
 * Expects these env vars:
 *   MERGE_AH_API_KEY         — Agent Handler API key
 *   MERGE_TOOL_PACK_ID       — Tool Pack ID from ah.merge.dev
 *   MERGE_REGISTERED_USER_ID — Registered User ID from ah.merge.dev
 *
 * If all three are present, the MCP server starts automatically at init.
 */

const AH_API = "https://ah-api.merge.dev"

export interface MergeAhConfig {
  agentHandlerApiKey: string
  toolPackId: string
  registeredUserId: string
}

export class MergeConnectorManager {
  private config: MergeAhConfig | null = null

  get isConfigured(): boolean {
    return (
      !!process.env.MERGE_AH_API_KEY &&
      !!process.env.MERGE_TOOL_PACK_ID &&
      !!process.env.MERGE_REGISTERED_USER_ID
    )
  }

  loadConfigFromEnv(): MergeAhConfig | null {
    const key = process.env.MERGE_AH_API_KEY
    const tp = process.env.MERGE_TOOL_PACK_ID
    const ru = process.env.MERGE_REGISTERED_USER_ID
    if (key && tp && ru) {
      this.config = {
        agentHandlerApiKey: key,
        toolPackId: tp,
        registeredUserId: ru,
      }
      return this.config
    }
    return null
  }

  setConfig(config: MergeAhConfig): void {
    this.config = config
  }

  getMcpConfig(): McpServerConfig | null {
    if (!this.config) {
      this.loadConfigFromEnv()
    }
    if (!this.config) return null

    return {
      url: `${AH_API}/api/v1/tool-packs/${this.config.toolPackId}/registered-users/${this.config.registeredUserId}/mcp`,
      headers: {
        Authorization: `Bearer ${this.config.agentHandlerApiKey}`,
      },
    }
  }

  get setupInstructions(): string[] {
    return []
  }

  async connect(_provider: string): Promise<ConnectorSession> {
    if (!this.config) this.loadConfigFromEnv()
    const mcpConfig = this.getMcpConfig()
    if (!mcpConfig) {
      throw new Error(
        "Merge Agent Handler is not configured. Set MERGE_AH_API_KEY, MERGE_TOOL_PACK_ID, and MERGE_REGISTERED_USER_ID.",
      )
    }
    return {
      connectionId: `mergedev_${Date.now()}`,
      provider: "mergedev",
      name: "Merge Agent Handler",
      startTime: new Date(),
      status: "connected",
      endpointUrl: mcpConfig.url ?? "",
    }
  }

  disconnect(): void {
    // Session lifecycle is owned by the MCP server; nothing to tear down here.
  }

  getConnectorList(): ConnectorEntry[] {
    const configured = this.getMcpConfig() !== null
    return [
      {
        slug: "mergedev",
        name: "Merge Agent Handler",
        description: "Exa + Firecrawl tool packs served by the Merge Agent Handler",
        provider: "mergedev",
        status: configured ? "connected" : "disconnected",
        category: "search",
        detail: configured ? "Configured" : "Not configured",
      },
    ]
  }
}

export const mergeConnectorManager = new MergeConnectorManager()

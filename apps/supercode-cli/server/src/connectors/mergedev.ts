import type { McpServerConfig } from "src/mcp/mcp-manager.ts"

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
}

export const mergeConnectorManager = new MergeConnectorManager()

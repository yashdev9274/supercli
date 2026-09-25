import type { ConnectorConfig } from "./types.ts"

/**
 * Built-in connector catalog. Actual MCP clients are managed by
 * `src/mcp/mcp-manager.ts` — this list is descriptive only.
 */
export const connectorCatalog: ConnectorConfig[] = [
  {
    id: "github",
    name: "GitHub",
    transport: "sse",
    url: "https://mcp.github.com/sse",
    enabled: false,
  },
  {
    id: "linear",
    name: "Linear",
    transport: "sse",
    url: "https://mcp.linear.app/sse",
    enabled: false,
  },
  {
    id: "slack",
    name: "Slack",
    transport: "sse",
    url: "https://mcp.slack.com/sse",
    enabled: false,
  },
]

export function listConnectors(opts?: { enabledOnly?: boolean }): ConnectorConfig[] {
  if (opts?.enabledOnly) return connectorCatalog.filter((c) => c.enabled)
  return [...connectorCatalog]
}

export function getConnector(id: string): ConnectorConfig | undefined {
  return connectorCatalog.find((c) => c.id === id)
}

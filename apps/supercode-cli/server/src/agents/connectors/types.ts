/**
 * Connector descriptors for the agents harness.
 * Transport stays in src/mcp/mcp-manager — these only describe which
 * MCP servers/tools to attach. No eve defineMcpClientConnection.
 */

export type ConnectorTransport = "stdio" | "sse" | "http" | "merge" | "composio"

export interface ConnectorConfig {
  /** Stable id used in registry keys */
  id: string
  /** Human label */
  name: string
  transport: ConnectorTransport
  /** SSE/HTTP endpoint when applicable */
  url?: string
  /** Command + args for stdio MCP servers */
  command?: string
  args?: string[]
  env?: Record<string, string>
  /** Optional tool-name allowlist once connected */
  tools?: string[]
  enabled?: boolean
}

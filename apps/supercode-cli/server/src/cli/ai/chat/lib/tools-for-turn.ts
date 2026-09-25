/**
 * Build the tool set for a chalk-chat turn (registry + MCP + env gating).
 */
import { tools } from "src/agents/tools/registry.ts"
import { getMcpManager } from "src/mcp/mcp-manager"
import { loadEnvOnce } from "src/lib/load-env"

export type ToolsForTurn = {
  tools: Record<string, unknown>
  preferenceHints: string[]
}

export async function buildToolsForTurn(
  onStatus?: (label: string) => void,
): Promise<ToolsForTurn> {
  onStatus?.("loading tools")
  const toolsToUse: Record<string, unknown> = { ...tools }

  const mcpManager = getMcpManager()
  if (mcpManager.isStarted) {
    onStatus?.("loading mcp tools")
    const mcpTools = await mcpManager.getAllTools()
    if (mcpTools && Object.keys(mcpTools).length > 0) {
      Object.assign(toolsToUse, mcpTools)
    }
  }

  loadEnvOnce()

  const isMergeDevConnected = mcpManager.connectedServers.includes("mergedev")

  // Legacy Google CSE path is retired in chat — use Exa / Firecrawl only.
  delete toolsToUse.web_search

  // Keep Exa + Firecrawl tools always available. Local keys are preferred; when
  // missing/invalid the tools fall back to the authenticated server proxy and
  // cross-provider search fallback (Exa ↔ Firecrawl).

  const preferenceHints: string[] = []

  preferenceHints.push(
    "For general web search, prefer `exa_search` (Exa). " +
      "If Exa fails, it automatically falls back to Firecrawl. " +
      "You may also call `firecrawl_search` directly. " +
      "Use `firecrawl_scrape` when the user asks for deep websearch or webscraping " +
      "(extracting full page content, following links, or fetching structured data from a page). " +
      "Use `firecrawl_map` to discover URLs on a site. " +
      "Do NOT use legacy `web_search`." +
      (isMergeDevConnected ? " These tools are routed through MergeDev's connectors when available." : ""),
  )

  if (Object.keys(toolsToUse).some((k) => k.startsWith("mcp_composio_"))) {
    preferenceHints.push(
      "Composio-connected MCP tools are available (prefixed with mcp_composio_). " +
        "These provide direct access to services like GitHub, Linear, Slack, etc. " +
        "When a user's request can be satisfied using these MCP tools, prefer them over running commands " +
        "via run_command or other built-in tools. For example, use mcp_composio_github_* tools for GitHub " +
        "operations instead of running gh CLI commands.",
    )
  }

  return { tools: toolsToUse, preferenceHints }
}

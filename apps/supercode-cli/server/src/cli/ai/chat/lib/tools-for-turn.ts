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
  const mergedevTools = isMergeDevConnected
    ? await mcpManager.getTools("mergedev")
    : {}
  const mcpProvided = new Set(Object.keys(mergedevTools))

  delete toolsToUse.web_search

  const hasExaSearch = !!process.env.EXA_API_KEY || mcpProvided.has("exa_search")
  const hasFirecrawlSearch =
    !!process.env.FIRECRAWL_API_KEY || mcpProvided.has("firecrawl_search")

  if (hasExaSearch && hasFirecrawlSearch) {
    delete toolsToUse.firecrawl_search
  }

  if (!hasFirecrawlSearch) {
    delete toolsToUse.firecrawl_search
    delete toolsToUse.firecrawl_scrape
    delete toolsToUse.firecrawl_map
  }

  if (!hasExaSearch) {
    delete toolsToUse.exa_search
    delete toolsToUse.exa_fetch
  }

  const preferenceHints: string[] = []

  if (hasExaSearch) {
    preferenceHints.push(
      "For general web search, use `exa_search` — it is preferred. " +
        "Use `firecrawl_scrape` when the user asks for deep websearch or webscraping (extracting full page content, " +
        "following links, or fetching structured data from a page). " +
        "Use `firecrawl_map` to discover URLs on a site." +
        (isMergeDevConnected ? " These tools are routed through MergeDev's connectors." : ""),
    )
  } else if (hasFirecrawlSearch) {
    preferenceHints.push(
      "For web search, use `firecrawl_search`. For scraping a specific URL use `firecrawl_scrape`, " +
        "and for discovering URLs on a site use `firecrawl_map`." +
        (isMergeDevConnected ? " These tools are routed through MergeDev's connectors." : ""),
    )
  }

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

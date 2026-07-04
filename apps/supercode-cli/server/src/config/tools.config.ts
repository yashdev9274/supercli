import chalk from "chalk"
import { tools as registryTools } from "src/tools/registry.ts"

type ToolConfig = {
  id: string
  name: string
  description: string
  getTool: () => Record<string, unknown>
  enabled: boolean
}

export const availableTools: ToolConfig[] = [
  {
    id: "web_search",
    name: "Web Search",
    description:
      "Search the web using Google Search. Useful for current events, news, and real-time information",
    getTool: () => registryTools.web_search as unknown as Record<string, unknown>,
    enabled: false,
  },
  {
    id: "code_exec",
    name: "Code Execution",
    description:
      "Execute JavaScript/TypeScript code in a sandboxed environment",
    getTool: () => registryTools.code_exec as unknown as Record<string, unknown>,
    enabled: false,
  },
  {
    id: "url_fetch",
    name: "URL Fetch",
    description:
      "Fetch and extract content from URLs to provide additional context",
    getTool: () => registryTools.url_fetch as unknown as Record<string, unknown>,
    enabled: false,
  },
  {
    id: "firecrawl_search",
    name: "Firecrawl Search",
    description:
      "Search the web using Firecrawl. Supports domain filtering and rich result extraction",
    getTool: () => registryTools.firecrawl_search as unknown as Record<string, unknown>,
    enabled: false,
  },
  {
    id: "firecrawl_scrape",
    name: "Firecrawl Scrape",
    description:
      "Fetch and extract markdown content from URLs using Firecrawl. Handles JS-rendered pages",
    getTool: () => registryTools.firecrawl_scrape as unknown as Record<string, unknown>,
    enabled: false,
  },
  {
    id: "firecrawl_map",
    name: "Firecrawl Map",
    description:
      "Discover URLs from a website to find documentation sections, blog posts, or pages",
    getTool: () => registryTools.firecrawl_map as unknown as Record<string, unknown>,
    enabled: false,
  },
  {
    id: "exa_search",
    name: "Exa Search",
    description:
      "Search the web using Exa. Returns relevant results with titles, snippets, and URLs",
    getTool: () => registryTools.exa_search as unknown as Record<string, unknown>,
    enabled: false,
  },
  {
    id: "exa_fetch",
    name: "Exa Fetch",
    description:
      "Fetch and extract full text content from a URL using Exa. Handles JS-rendered pages",
    getTool: () => registryTools.exa_fetch as unknown as Record<string, unknown>,
    enabled: false,
  },
  {
    id: "write_file",
    name: "Write File",
    description:
      "Create and modify files in the workspace",
    getTool: () => registryTools.write_file as unknown as Record<string, unknown>,
    enabled: true,
  },
  {
    id: "run_command",
    name: "Run Command",
    description:
      "Execute shell commands in the workspace",
    getTool: () => registryTools.run_command as unknown as Record<string, unknown>,
    enabled: true,
  },
]

function tryGetConfigTools(
  filterFn: (tool: ToolConfig) => boolean,
): Record<string, unknown> | undefined {
  const result: Record<string, unknown> = {}

  try {
    for (const toolConfig of availableTools) {
      if (filterFn(toolConfig)) {
        result[toolConfig.id] = toolConfig.getTool()
      }
    }
    return Object.keys(result).length > 0 ? result : undefined
  } catch (error) {
    console.error(
      chalk.red("Failed to initialize tools:"),
      error instanceof Error ? error.message : String(error)
    )
    return undefined
  }
}

export function getAllConfigTools(): Record<string, unknown> | undefined {
  return tryGetConfigTools(() => true)
}

export function getEnabledTools(): Record<string, unknown> | undefined {
  return tryGetConfigTools((t) => t.enabled)
}

export function toggleTool(toolId: string): boolean {
  const tool = availableTools.find((t) => t.id === toolId)

  if (tool) {
    tool.enabled = !tool.enabled
    return tool.enabled
  }

  return false
}

export function enableTools(toolIds: string[]): void {
  availableTools.forEach(tool => {
    tool.enabled = toolIds.includes(tool.id)
  })
}

export function getEnabledToolNames(): string[] {
  return availableTools.filter(t => t.enabled).map(t => t.name)
}

export function resetTools(): void {
  availableTools.forEach(tool => {
    tool.enabled = false
  })
}

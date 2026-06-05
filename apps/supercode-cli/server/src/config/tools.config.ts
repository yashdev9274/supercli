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

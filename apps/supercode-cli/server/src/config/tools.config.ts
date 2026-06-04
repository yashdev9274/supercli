import { google } from "@ai-sdk/google";
import chalk from "chalk";

type ToolConfig = {
  id: string
  name: string
  description: string
  getTool: () => Record<string, unknown>
  enabled: boolean
}

export const availableTools: ToolConfig[] = [
  {
    id: "google_search",
    name: "Google Search",
    description:
      "Access the latest information using Google Search. Useful for current events, news, and real-time information",
    getTool: () => google.tools!.googleSearch({}) as unknown as Record<string, unknown>,
    enabled: false,
  },
  {
    id: "code_execution",
    name: "Code Execution",
    description:
      "Execute JavaScript/TypeScript code in a sandboxed environment",
    getTool: () => google.tools!.codeExecution({}) as unknown as Record<string, unknown>,
    enabled: false,
  },
  {
    id: "url_context",
    name: "URL Context",
    description:
      "Fetch and extract content from URLs to provide additional context",
    getTool: () => google.tools!.urlContext({}) as unknown as Record<string, unknown>,
    enabled: false,
  },
]

export function getEnabledTools(): Record<string, unknown> | undefined {
  const tools: Record<string, unknown> = {}

  try {
    for (const toolConfig of availableTools) {
      if (toolConfig.enabled) {
        tools[toolConfig.id] = toolConfig.getTool()
      }
    }

    if (Object.keys(tools).length > 0) {
      console.log(
        chalk.gray(
          `[DEBUG] Enabled tools: ${Object.keys(tools).join(", ")}`
        )
      )
    } else {
      console.log(chalk.yellow("[DEBUG] No tools enabled"))
    }

    return Object.keys(tools).length > 0 ? tools : undefined
  } catch (error) {
    console.error(
      chalk.red("[ERROR] Failed to initialize tools:"),
      error instanceof Error ? error.message : String(error)
    )
    console.error(
      chalk.yellow(
        "Make sure you have @ai-sdk/google version 2.0+ installed"
      )
    )
    console.error(
      chalk.yellow(
        "Run: npm install @ai-sdk/google@latest"
      )
    )
    return undefined
  }
}

export function toggleTool(toolId: string): boolean {
  const tool = availableTools.find((t) => t.id === toolId)

  if (tool) {
    tool.enabled = !tool.enabled
    console.log(
      chalk.gray(`[DEBUG] Tool ${toolId} toggled to ${tool.enabled}`)
    )
    return tool.enabled
  }

  console.log(chalk.red(`[DEBUG] Tool ${toolId} not found`))
  return false
}

export function enableTools(toolIds: string[]): void {
  console.log(chalk.gray("[DEBUG] enableTools called with:"), toolIds)

  availableTools.forEach(tool => {
    const wasEnabled = tool.enabled
    tool.enabled = toolIds.includes(tool.id)
    if (tool.enabled !== wasEnabled) {
      console.log(
        chalk.gray(`[DEBUG] ${tool.id}: ${wasEnabled} -> ${tool.enabled}`)
      )
    }
  })

  const enabledCount = availableTools.filter(t => t.enabled).length
  console.log(
    chalk.gray(
      `[DEBUG] Total tools enabled: ${enabledCount}/${availableTools.length}`
    )
  )
}

export function getEnabledToolNames(): string[] {
  const names = availableTools.filter(t => t.enabled).map(t => t.name)
  console.log(chalk.gray("[DEBUG] getEnabledToolNames returning:"), names)
  return names
}

export function resetTools(): void {
  availableTools.forEach(tool => {
    tool.enabled = false
  })
  console.log(
    chalk.gray("[DEBUG] All tools have been reset (disabled)")
  )
}

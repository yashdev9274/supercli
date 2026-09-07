import { tools as agentTools, toolMeta } from "src/agents"
import { getMcpManager } from "src/mcp/mcp-manager"

/**
 * Load agents tools + MCP/composio merge.
 * Mode filter can narrow later; default exposes full agent tool set.
 */
export async function loadSessionTools(_opts?: {
  mode?: string
  includeMcp?: boolean
}): Promise<{ tools: Record<string, unknown>; meta: typeof toolMeta }> {
  const tools: Record<string, unknown> = { ...agentTools }
  const includeMcp = _opts?.includeMcp !== false

  if (includeMcp) {
    try {
      const mcpManager = getMcpManager()
      if (mcpManager.isStarted) {
        const mcpTools = await mcpManager.getAllTools()
        if (mcpTools && Object.keys(mcpTools).length > 0) {
          Object.assign(tools, mcpTools)
        }
      }
    } catch {
      // MCP optional — degrade gracefully
    }
  }

  return {
    tools,
    meta: toolMeta,
  }
}

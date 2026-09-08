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

  if (_opts?.mode === "plan" || _opts?.mode === "explore") {
    // Unknown MCP tools cannot be assumed read-only.
    for (const name of Object.keys(tools)) {
      const category = toolMeta[name]?.category
      if (category !== "read" && category !== "web") delete tools[name]
    }
  }

  return {
    tools,
    meta: toolMeta,
  }
}

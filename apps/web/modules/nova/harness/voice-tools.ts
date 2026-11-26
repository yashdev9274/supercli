import { classifyComposioTool, validateArguments } from "@super/agent-runtime"

import type { HarnessChatTool } from "./client"
import { requestHarnessComposio, type ComposioTool } from "./composio-client"

export function createVoiceReadTools(token: string, signal?: AbortSignal) {
  let catalog: Promise<ComposioTool[]> | undefined
  const offered = new Map<string, ComposioTool>()
  const tools: HarnessChatTool[] = [
    {
      type: "function",
      function: {
        name: "find_connected_read_tools",
        description: "Find read-only tools for the user's connected apps. Use only for private app data, not general knowledge or public news. Search by app and task, then pass a returned tool name and its schema-valid arguments to read_connected_app.",
        parameters: { type: "object", properties: { query: { type: "string", minLength: 1, maxLength: 200 } }, required: ["query"], additionalProperties: false },
      },
    },
    {
      type: "function",
      function: {
        name: "read_connected_app",
        description: "Execute a read-only tool returned by find_connected_read_tools. Never sends messages or modifies app data.",
        parameters: { type: "object", properties: { toolName: { type: "string" }, arguments: { type: "object", additionalProperties: true } }, required: ["toolName", "arguments"], additionalProperties: false },
      },
    },
  ]

  async function execute(name: string, args: Record<string, unknown>) {
    signal?.throwIfAborted()
    if (name === "find_connected_read_tools") {
      const query = String(args.query ?? "").trim().toLowerCase()
      if (!query || query.length > 200) throw new Error("Provide an app or task to search for")
      catalog ??= requestHarnessComposio<{ tools: ComposioTool[] }>("tools", token, {}, signal)
        .then((result) => result.tools.filter((tool) => classifyComposioTool(tool.name, tool.requiresApproval) === "read"))
      const words = query.split(/\W+/).filter(Boolean)
      const matches = (await catalog).map((tool) => ({
        tool,
        score: words.reduce((score, word) => score + ((tool.name + " " + tool.displayName + " " + tool.toolkit + " " + tool.description).toLowerCase().includes(word) ? 1 : 0), 0),
      })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name)).slice(0, 6)
      for (const { tool } of matches) offered.set(tool.name, tool)
      return { tools: matches.map(({ tool }) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })) }
    }
    if (name !== "read_connected_app") throw new Error("Unknown voice tool")
    const tool = offered.get(String(args.toolName))
    if (!tool || classifyComposioTool(tool.name, tool.requiresApproval) !== "read") throw new Error("Discover an authorized read-only tool before executing it")
    const validated = validateArguments(tool.parameters, args.arguments) as Record<string, unknown>
    return requestHarnessComposio<Record<string, unknown>>("execute", token, { toolName: tool.name, arguments: validated }, signal)
  }

  return { tools, execute }
}

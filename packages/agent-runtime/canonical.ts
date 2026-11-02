import definitions from "./canonical-tools.json"
import type { AgentTool, AgentToolSchema } from "./types"
import { classifyComposioTool } from "./tool-policy"

export const canonicalSchemas: Record<string, AgentToolSchema> = definitions as Record<string, AgentToolSchema>

export function canonicalAccess(name: string): AgentTool["access"] {
  if (["write_file", "edit_file"].includes(name)) return "write"
  if (["run_command", "code_exec"].includes(name)) return "execute"
  if (["delegate", "task", "question", "todowrite", "switch_to_agent_mode", "skill"].includes(name)) return "state"
  if (name in canonicalSchemas) return "read"
  return classifyComposioTool(name) === "read" ? "read" : "write"
}

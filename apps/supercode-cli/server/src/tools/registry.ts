import { tool } from "ai"
import { z } from "zod"
import { readFileTool } from "./definitions/read-file.ts"
import { searchFilesTool } from "./definitions/search-files.ts"
import { writeFileTool } from "./definitions/write-file.ts"
import { editFileTool } from "./definitions/edit-file.ts"
import { runCommandTool } from "./definitions/run-command.ts"
import { urlFetchTool } from "./definitions/url-fetch.ts"
import { webSearchTool } from "./definitions/web-search.ts"
import { firecrawlSearchTool } from "./definitions/firecrawl-search.ts"
import { firecrawlScrapeTool } from "./definitions/firecrawl-scrape.ts"
import { firecrawlMapTool } from "./definitions/firecrawl-map.ts"
import { exaSearchTool } from "./definitions/exa-search.ts"
import { exaFetchTool } from "./definitions/exa-fetch.ts"
import { codeExecTool } from "./definitions/code-exec.ts"
import { readInstructionsTool } from "./definitions/read-instructions.ts"
import { switchToAgentModeTool } from "./definitions/switch-to-agent-mode.ts"
import { delegateTool, taskTool } from "./definitions/delegate.ts"
import { questionTool } from "./definitions/question.ts"
import { todowriteTool } from "./definitions/todowrite.ts"
import { permissionManager } from "./permission-manager.ts"

//
// AI SDK 6 changed the tool property from `parameters` to `inputSchema`.
// Without this wrapper, the SDK silently drops tool-call args during
// streamText reparsing — every call surfaces as "(missing arguments —
// model bug)". Wrap each definition with `tool({ inputSchema })` so the
// SDK can attach the schema to the wire format and recover args.
//
function defineTool<T extends z.ZodTypeAny>(def: {
  description: string
  parameters: T
  execute: (args: z.infer<T>) => Promise<unknown>
}) {
  return tool({
    description: def.description,
    inputSchema: def.parameters,
    execute: async (input: z.infer<T>) => def.execute(input),
  })
}

function withPermission<T extends z.ZodTypeAny>(
  name: string,
  def: {
    description: string
    parameters: T
    execute: (args: z.infer<T>) => Promise<unknown>
  },
) {
  return tool({
    description: def.description,
    inputSchema: def.parameters,
    execute: async (input: z.infer<T>) => {
      const allowed = await permissionManager.check(name, input)
      if (!allowed) {
        return JSON.stringify({ cancelled: true, reason: "Permission denied by user" })
      }
      return def.execute(input)
    },
  })
}

// ---- Tool metadata registry ----
//
// Describes each tool's category and risk level so upstream consumers
// (UI, analytics, audit log) can introspect without hardcoding names.

export type ToolCategory = "read" | "write" | "execute" | "web" | "agent"

export interface ToolMeta {
  category: ToolCategory
  requiresPermission: boolean
  description: string
}

export const toolMeta: Record<string, ToolMeta> = {
  read_file: { category: "read", requiresPermission: false, description: readFileTool.description },
  search_files: { category: "read", requiresPermission: false, description: searchFilesTool.description },
  write_file: { category: "write", requiresPermission: true, description: writeFileTool.description },
  edit_file: { category: "write", requiresPermission: true, description: editFileTool.description },
  run_command: { category: "execute", requiresPermission: true, description: runCommandTool.description },
  url_fetch: { category: "web", requiresPermission: false, description: urlFetchTool.description },
  web_search: { category: "web", requiresPermission: false, description: webSearchTool.description },
  firecrawl_search: { category: "web", requiresPermission: false, description: firecrawlSearchTool.description },
  firecrawl_scrape: { category: "web", requiresPermission: false, description: firecrawlScrapeTool.description },
  firecrawl_map: { category: "web", requiresPermission: false, description: firecrawlMapTool.description },
  exa_search: { category: "web", requiresPermission: false, description: exaSearchTool.description },
  exa_fetch: { category: "web", requiresPermission: false, description: exaFetchTool.description },
  code_exec: { category: "execute", requiresPermission: true, description: codeExecTool.description },
  read_instructions: { category: "read", requiresPermission: false, description: readInstructionsTool.description },
  switch_to_agent_mode: { category: "agent", requiresPermission: false, description: switchToAgentModeTool.description },
  delegate: { category: "agent", requiresPermission: false, description: delegateTool.description },
  task: { category: "agent", requiresPermission: false, description: taskTool.description },
  question: { category: "agent", requiresPermission: false, description: questionTool.description },
  todowrite: { category: "agent", requiresPermission: false, description: todowriteTool.description },
}

export const tools = {
  read_file: defineTool(readFileTool),
  search_files: defineTool(searchFilesTool),
  write_file: withPermission("write_file", writeFileTool),
  edit_file: withPermission("edit_file", editFileTool),
  run_command: withPermission("run_command", runCommandTool),
  url_fetch: defineTool(urlFetchTool),
  web_search: defineTool(webSearchTool),
  firecrawl_search: defineTool(firecrawlSearchTool),
  firecrawl_scrape: defineTool(firecrawlScrapeTool),
  firecrawl_map: defineTool(firecrawlMapTool),
  exa_search: defineTool(exaSearchTool),
  exa_fetch: defineTool(exaFetchTool),
  code_exec: withPermission("code_exec", codeExecTool),
  read_instructions: defineTool(readInstructionsTool),
  switch_to_agent_mode: defineTool(switchToAgentModeTool),
  delegate: defineTool(delegateTool),
  task: defineTool(taskTool),
  question: defineTool(questionTool),
  todowrite: defineTool(todowriteTool),
}

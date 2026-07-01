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
import { codeExecTool } from "./definitions/code-exec.ts"
import { readInstructionsTool } from "./definitions/read-instructions.ts"
import { switchToAgentModeTool } from "./definitions/switch-to-agent-mode.ts"
import { delegateTool, taskTool } from "./definitions/delegate.ts"
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
  code_exec: withPermission("code_exec", codeExecTool),
  read_instructions: defineTool(readInstructionsTool),
  switch_to_agent_mode: defineTool(switchToAgentModeTool),
  delegate: defineTool(delegateTool),
  task: defineTool(taskTool),
}

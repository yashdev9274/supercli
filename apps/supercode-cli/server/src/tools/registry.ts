import { readFileTool } from "./definitions/read-file.ts"
import { searchFilesTool } from "./definitions/search-files.ts"
import { writeFileTool } from "./definitions/write-file.ts"
import { runCommandTool } from "./definitions/run-command.ts"
import { urlFetchTool } from "./definitions/url-fetch.ts"
import { webSearchTool } from "./definitions/web-search.ts"
import { codeExecTool } from "./definitions/code-exec.ts"
import { permissionManager } from "./permission-manager.ts"

function withPermission(tool: Record<string, unknown>): Record<string, unknown> {
  const originalExecute = tool.execute as ((args: any) => Promise<string>) | undefined
  if (!originalExecute) return tool
  return {
    ...tool,
    execute: async (args: any) => {
      const allowed = await permissionManager.check(
        (tool.name || tool.description) as string,
        args,
      )
      if (!allowed) {
        return JSON.stringify({ cancelled: true, reason: "Permission denied by user" })
      }
      return originalExecute(args)
    },
  }
}

export const tools = {
  read_file: readFileTool,
  search_files: searchFilesTool,
  write_file: withPermission(writeFileTool as unknown as Record<string, unknown>),
  run_command: withPermission(runCommandTool as unknown as Record<string, unknown>),
  url_fetch: urlFetchTool,
  web_search: webSearchTool,
  code_exec: withPermission(codeExecTool as unknown as Record<string, unknown>),
}

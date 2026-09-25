import { tool } from "ai"
import type { z } from "zod"
import { permissionManager } from "src/tools/permission-manager.ts"
import type { DefinedTool } from "../lib/define.ts"
import type { ToolCategory, ToolMeta } from "../lib/types.ts"

import { readFileTool } from "./read_file.ts"
import { searchFilesTool } from "./search_files.ts"
import { writeFileTool } from "./write_file.ts"
import { editFileTool } from "./edit_file.ts"
import { runCommandTool } from "./run_command.ts"
import { urlFetchTool } from "./url_fetch.ts"
import { webSearchTool } from "./web_search.ts"
import { firecrawlSearchTool } from "./firecrawl_search.ts"
import { firecrawlScrapeTool } from "./firecrawl_scrape.ts"
import { firecrawlMapTool } from "./firecrawl_map.ts"
import { exaSearchTool } from "./exa_search.ts"
import { exaFetchTool } from "./exa_fetch.ts"
import { codeExecTool } from "./code_exec.ts"
import { readInstructionsTool } from "./read_instructions.ts"
import { switchToAgentModeTool } from "./switch_to_agent_mode.ts"
import { delegateTool, taskTool } from "./delegate.ts"
import { questionTool } from "./question.ts"
import { todowriteTool } from "./todowrite.ts"
import { skillTool } from "./skill.ts"
import { crispReviewTool } from "./crisp_review.ts"
import { crispAuditTool } from "./crisp_audit.ts"
import { crispDebtTool } from "./crisp_debt.ts"
import { crispGainTool } from "./crisp_gain.ts"

function asSdk(t: DefinedTool | { sdk?: unknown; description?: string }): unknown {
  if (t && typeof t === "object" && "sdk" in t && t.sdk) return t.sdk
  return t
}

function withPermissionSdk<T extends z.ZodTypeAny>(
  name: string,
  defined: DefinedTool<T>,
): unknown {
  return tool({
    description: defined.description,
    inputSchema: defined.inputSchema,
    execute: async (input: z.infer<typeof defined.inputSchema>, options) => {
      const allowed = await permissionManager.check(name, input as Record<string, unknown>)
      if (!allowed) {
        return JSON.stringify({ cancelled: true, reason: "Permission denied by user" })
      }
      return defined.execute(defined.inputSchema.parse(input), { signal: options.abortSignal })
    },
  })
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
  skill: { category: "agent", requiresPermission: false, description: skillTool.description },
  crisp_review: { category: "agent", requiresPermission: false, description: crispReviewTool.description },
  crisp_audit: { category: "agent", requiresPermission: false, description: crispAuditTool.description },
  crisp_debt: { category: "agent", requiresPermission: false, description: crispDebtTool.description },
  crisp_gain: { category: "agent", requiresPermission: false, description: crispGainTool.description },
}

export const tools: Record<string, unknown> = {
  read_file: asSdk(readFileTool),
  search_files: asSdk(searchFilesTool),
  write_file: withPermissionSdk("write_file", writeFileTool),
  edit_file: withPermissionSdk("edit_file", editFileTool),
  run_command: withPermissionSdk("run_command", runCommandTool),
  url_fetch: asSdk(urlFetchTool),
  web_search: asSdk(webSearchTool),
  firecrawl_search: asSdk(firecrawlSearchTool),
  firecrawl_scrape: asSdk(firecrawlScrapeTool),
  firecrawl_map: asSdk(firecrawlMapTool),
  exa_search: asSdk(exaSearchTool),
  exa_fetch: asSdk(exaFetchTool),
  code_exec: withPermissionSdk("code_exec", codeExecTool),
  read_instructions: asSdk(readInstructionsTool),
  switch_to_agent_mode: asSdk(switchToAgentModeTool),
  delegate: asSdk(delegateTool),
  task: asSdk(taskTool),
  question: asSdk(questionTool),
  todowrite: asSdk(todowriteTool),
  skill: asSdk(skillTool),
  crisp_review: asSdk(crispReviewTool),
  crisp_audit: asSdk(crispAuditTool),
  crisp_debt: asSdk(crispDebtTool),
  crisp_gain: asSdk(crispGainTool),
}

export type { ToolCategory, ToolMeta }

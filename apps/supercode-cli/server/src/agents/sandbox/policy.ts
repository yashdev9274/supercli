/**
 * Workspace path + shell policy helpers used by tools/harness.
 * Actual path resolution stays in src/lib/workspace.
 */
import { resolvePath } from "src/lib/workspace"

export { resolvePath }

export function getWorkspaceRoot(): string {
  return process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()
}

/** Tools that mutate the workspace or execute code. */
export const DESTRUCTIVE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "run_command",
  "code_exec",
])

export const READ_TOOLS = new Set([
  "read_file",
  "search_files",
  "read_instructions",
  "url_fetch",
  "web_search",
  "firecrawl_search",
  "firecrawl_scrape",
  "firecrawl_map",
  "exa_search",
  "exa_fetch",
])

export function isDestructiveTool(name: string): boolean {
  return DESTRUCTIVE_TOOLS.has(name)
}

export function isReadTool(name: string): boolean {
  return READ_TOOLS.has(name)
}

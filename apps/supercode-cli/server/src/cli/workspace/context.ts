/**
 * System prompt builder for interactive coding sessions.
 * Assembles modular sections from ./prompt/*.
 */
import type { WorkspaceInfo } from "./scanner.ts"
import {
  identitySection,
  workspaceSection,
  principlesSection,
  toolsSection,
  workingDirectorySection,
  webSearchSection,
  toneSection,
  toolBudgetSection,
  newAppWorkflowSection,
  honestySection,
  reviewSection,
  skillsSection,
  crispSection,
} from "./prompt/index.ts"

export function buildSystemPrompt(info: WorkspaceInfo, hasTools = false): string {
  const lines: string[] = []

  lines.push(...identitySection(info))
  lines.push(...principlesSection())
  lines.push(...workspaceSection(info))

  if (hasTools) {
    lines.push(...toolsSection())
  }

  lines.push(...webSearchSection())
  lines.push(...toneSection())
  lines.push(...toolBudgetSection())
  lines.push(...newAppWorkflowSection())
  lines.push(...workingDirectorySection())
  lines.push(...honestySection())
  lines.push(...skillsSection())
  lines.push(...crispSection())
  lines.push(...reviewSection())

  return lines.join("\n")
}

export function shortWorkspaceSummary(info: WorkspaceInfo): string {
  const parts: string[] = []
  if (info.gitBranch) parts.push(`Git: ${info.gitBranch}`)
  if (info.techStack.length > 0) parts.push(info.techStack.slice(0, 4).join(" · "))
  parts.push(`${info.fileCount} files`)
  return parts.join("  ·  ")
}

/** Mode-specific tails appended by the chat stream path (not the base prompt). */
export function chatModeTail(): string {
  return `
## Chat Mode Note

You are in chat mode. You have access to read,
search, and web tools (read_file, search_files, url_fetch, firecrawl, exa, etc.).
Read-only shell commands (git status/log/diff, ls, cat, pwd, find, grep) and
read-only git commands are auto-allowed without prompting.

Tools that modify state — write_file, edit_file, git push, git commit, git reset,
npm install, rm, mkdir, and any other write/delete command — require explicit
per-user approval. If the user's task genuinely needs many such operations
without interruptions, call the \`switch_to_agent_mode\` tool ONCE with a clear
reason; the system will ask for user approval. Do NOT attempt write/exec tools
in the same response where you call switch_to_agent_mode.

## Tool Use (Mandatory)

When the user's request is an action on their repo or workspace — review staged
changes, show diff, run a command, read a file, find something, check status,
fix a file, etc. — you MUST invoke the appropriate tool (run_command,
read_file, search_files, etc.) BEFORE you respond. Do not just describe what
you would do. Do not answer conversationally when the user asked you to do
something. If your first response contains only reasoning or text and no tool
call, the system will count the turn as incomplete and the user will not see
any action taken. Call the tool first, then summarize the result.`
}

export function planModeTail(): string {
  return `
## Plan Mode Note

You are in plan mode. You MUST NOT write files, run commands, or execute code. Produce a structured plan and stop. The user will review with /plan execute.`
}

export { progressDisplaySection } from "./prompt/tone.ts"

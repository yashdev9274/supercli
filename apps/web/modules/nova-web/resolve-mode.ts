import type { NovaAgentMode } from "@/modules/nova-web/models"

/**
 * Pick chat vs agent vs plan from the user message when the chip is on Auto
 * (or when we soft-suggest). Explicit chip still wins if lockExplicit is true.
 */
const AGENT_RE =
  /\b(fix|implement|build|create|add|update|change|edit|refactor|rewrite|migrate|delete|remove|rename|move|wire|patch|apply|commit|push|open\s+pr|make\s+pr|pull\s+request|ship|deploy|install|configure|set\s+up|setup|integrate|connect|disconnect|comment\s+on|reply\s+to|assign|label|merge|close\s+issue|file\s+change|write\s+(the\s+)?code|code\s+change)\b/i

const APP_ACTION_RE =
  /\b(github|linear|slack|notion|jira|figma|gmail|google\s*calendar|composio|mcp|connected\s+app|integration)\b/i

const FETCH_APP_RE =
  /\b(fetch|list|get|show|find|search|read|pull\s+up|look\s+up|last\s+pr|latest\s+pr|open\s+prs|my\s+prs|issues?)\b/i

const PLAN_RE =
  /\b(plan|design|architect|approach|tradeoffs?|roadmap|spec\b|how\s+should\s+we|what'?s\s+the\s+best\s+way)\b/i

const CHAT_RE =
  /\b(what\s+is|what'?s|why\s+does|why\s+is|how\s+does|explain|summarize|summary|meaning|difference\s+between|do\s+you\s+think|opinion|hello|hi\b|thanks|thank\s+you)\b/i

export function resolveNovaTurnMode(input: {
  message: string
  explicitMode?: NovaAgentMode | null
  /** When true, never override the composer chip. */
  lockExplicit?: boolean
  hasProject?: boolean
  hasAttachments?: boolean
  hasConnectedApps?: boolean
}): { mode: NovaAgentMode; reason: string; auto: boolean } {
  const explicit = input.explicitMode ?? null
  if (explicit && input.lockExplicit) {
    return { mode: explicit, reason: `Using ${explicit} mode from composer`, auto: false }
  }

  const text = input.message.trim()
  const lower = text.toLowerCase()

  // Attachments / project file work → agent
  if (input.hasAttachments) {
    return { mode: "agent", reason: "Attachments present — agent mode for file work", auto: true }
  }

  // Connected-app fetch or mutation language → agent (tools + optional writes)
  if (APP_ACTION_RE.test(text) && (FETCH_APP_RE.test(text) || AGENT_RE.test(text))) {
    return {
      mode: "agent",
      reason: "Connected-app request — agent mode so MCP/tools can run",
      auto: true,
    }
  }

  if (AGENT_RE.test(text) || lower.includes("make these changes") || lower.includes("path=")) {
    return { mode: "agent", reason: "Implementation language — agent mode", auto: true }
  }

  if (input.hasProject && /\b(fix|bug|ui|sidebar|component|test|typecheck|lint)\b/i.test(text)) {
    return { mode: "agent", reason: "Project-bound fix request — agent mode", auto: true }
  }

  if (PLAN_RE.test(text) && !AGENT_RE.test(text)) {
    return { mode: "plan", reason: "Planning language — plan mode", auto: true }
  }

  if (CHAT_RE.test(text) && !AGENT_RE.test(text) && !APP_ACTION_RE.test(text)) {
    return { mode: "chat", reason: "Q&A language — chat mode", auto: true }
  }

  // Short questions without verbs of change
  if (text.length < 80 && /[?]$/.test(text) && !AGENT_RE.test(text)) {
    return { mode: "chat", reason: "Short question — chat mode", auto: true }
  }

  // Default: respect chip if set, else agent when project linked, else chat
  if (explicit) {
    return { mode: explicit, reason: `Using ${explicit} mode from composer`, auto: false }
  }
  if (input.hasProject) {
    return { mode: "agent", reason: "Project linked — default agent mode", auto: true }
  }
  return { mode: "chat", reason: "Default chat mode", auto: true }
}

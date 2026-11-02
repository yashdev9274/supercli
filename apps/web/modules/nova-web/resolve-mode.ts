import type { NovaAgentMode } from "@/modules/nova-web/models"

const ACTION = /\b(fix|implement|build|create|add|update|change|edit|refactor|rewrite|migrate|delete|remove|rename|move|wire|patch|apply|commit|push|deploy|install|configure|integrate|connect|disconnect|merge|replace|generate|scaffold|write|make|set\s+up|setup|comment\s+on|reply\s+to|assign|open\s+(?:a\s+)?pr)\b/i
const IMPLEMENT_NOW = /\b(?:then|and)\s+(?:please\s+)?(?:implement|build|create|apply|fix|update|delete|make)\b|\b(?:implement|apply|build)\s+(?:it|this|that|the\s+plan)\s+(?:now|too)\b/i
const PLAN_ONLY = /\b(?:plan\s+(?:only|first)|only\s+(?:plan|design)|(?:do\s+not|don't|without|no)\s+(?:actually\s+)?(?:edit|editing|modify|modifying|change|changing|write|writing|implement|implementing|delete|deleting|creat(?:e|ing))\b)/i
const PLAN_REQUEST = /^(?:please\s+)?(?:plan\b|design\b|architect\b|draft\s+(?:a\s+)?(?:plan|spec)|(?:give|write|create|make)\s+(?:me\s+)?(?:a\s+)?(?:plan|roadmap|spec(?:ification)?)\b)|\b(?:implementation\s+plan|how\s+should\s+we|what'?s\s+the\s+best\s+way|tradeoffs?|roadmap)\b/i
const EXPLANATION = /^(?:please\s+)?(?:what\b|why\b|how\b|explain\b|summariz(?:e|ation)\b|describe\b|review\b|compare\b|show\b|list\b|fetch\b|find\b|search\b|read\b|look\s+up\b|tell\s+me\b)|\b(?:what\s+is|how\s+does|difference\s+between)\b/i
const DIRECT_REQUEST = /^(?:please\s+)?(?:can|could|would|will)\s+you\s+(?:please\s+)?(?:fix|implement|build|create|add|update|change|edit|refactor|delete|remove|rename|move|write|make|generate|scaffold)\b/i

/** This selects capabilities before execution; it never upgrades a locked read-only turn. */
export function resolveNovaTurnMode(input: {
  message: string
  explicitMode?: NovaAgentMode | null
  lockExplicit?: boolean
  hasProject?: boolean
  hasAttachments?: boolean
  hasConnectedApps?: boolean
}): { mode: NovaAgentMode; reason: string; auto: boolean } {
  const explicit = input.explicitMode ?? null
  if (explicit && input.lockExplicit) return { mode: explicit, reason: `Using ${explicit} mode from composer`, auto: false }
  const text = input.message.trim()
  // Ignore quoted code and attachment payloads: only the user's request selects permissions.
  const request = text.replace(/```[\s\S]*?```/g, "").replace(/<nova_(?:local_files|local_project_paths)>[\s\S]*?<\/nova_(?:local_files|local_project_paths)>/g, "").trim()
  const choose = (mode: NovaAgentMode, reason: string) => ({ mode, reason, auto: true })
  if (PLAN_ONLY.test(request)) return choose("plan", "Planning/read-only restriction — no file mutations")
  if (PLAN_REQUEST.test(request) && !IMPLEMENT_NOW.test(request)) return choose("plan", "Planning request — investigate and design without editing")
  if (DIRECT_REQUEST.test(request) || IMPLEMENT_NOW.test(request)) return choose("agent", "Implementation requested — file mutation capabilities enabled")
  // Questions about creating/deleting are not authorization to perform those actions.
  if (EXPLANATION.test(request)) return choose("chat", "Question or read-only investigation — no mutations")
  if (ACTION.test(request) || /\bmake\s+these\s+changes\b/i.test(request)) return choose("agent", "Implementation or mutation requested — agent mode")
  if (/\b(?:hello|hi|thanks|thank\s+you)\b/i.test(request) || /\?$/.test(request)) return choose("chat", "Conversation — chat mode")
  if (explicit) return { mode: explicit, reason: `Using ${explicit} mode from composer`, auto: false }
  return choose("chat", "No implementation requested — chat mode")
}

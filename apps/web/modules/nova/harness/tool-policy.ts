/**
 * Classify Composio / MCP tools for Nova web.
 * Read tools run in every mode. Write tools only in Agent mode.
 */

const READ_HINT =
  /(^|_)(CHECK|DESCRIBE|DOWNLOAD|FETCH|FIND|GET|LIST|LOOKUP|QUERY|READ|RETRIEVE|SEARCH|VIEW|SHOW|COUNT|STATS|STATUS|COMPARE|DIFF|TREE|BLOB|CONTENTS|COMMITS?|FILES?|BRANCHES|REPOS?|ISSUES?|PULLS?|REVIEWS?|COMMENTS?|WORKFLOWS?|RUNS?|ARTIFACTS?|MEMBERS?|ORGS?|USERS?|ME|META|INFO|ACTIVITY|TIMELINE|NOTIFICATIONS?|LABELS?|MILESTONES?|PROJECTS?|MERGED|OPEN|CLOSED)(_|$)/i

const WRITE_HINT =
  /(^|_)(CREATE|UPDATE|DELETE|REMOVE|ADD|SET|SEND|POST|PUT|PATCH|PUSH|MERGE|CLOSE|REOPEN|ASSIGN|UNASSIGN|UPLOAD|WRITE|EDIT|INSERT|DESTROY|REVOKE|CANCEL|TRIGGER|DISPATCH|FORK|STAR|WATCH|FOLLOW|INVITE|ACCEPT|REJECT|APPROVE|REQUEST_REVIEW|ENABLE|DISABLE|INSTALL|UNINSTALL|PUBLISH|DEPLOY|RELEASE|LOCK|UNLOCK|TRANSFER|BLOCK|UNBLOCK|PIN|UNPIN|SUBSCRIBE|REACT|COMMENT|REPLY|LABEL_ADD|LABEL_REMOVE|REPLACE|SYNC|MOVE|RENAME|COPY|CLONE_AND|FORCE)(_|$)/i

export type NovaToolAccess = "read" | "write" | "unknown"

export function classifyComposioTool(name: string, requiresApproval?: boolean | null): NovaToolAccess {
  const slug = name.trim()
  if (!slug) return "unknown"

  // Explicit write beats a soft read token in the same name (e.g. CREATE_OR_UPDATE).
  if (WRITE_HINT.test(slug)) return "write"
  if (READ_HINT.test(slug)) return "read"

  // Fall back to CLI flag when name is ambiguous.
  if (requiresApproval === false) return "read"
  if (requiresApproval === true) return "write"
  return "unknown"
}

export function toolsAllowedForMode(
  mode: string | null | undefined,
  tools: Array<{ name: string; requiresApproval?: boolean | null }>,
): Array<{ name: string; requiresApproval?: boolean | null }> {
  const normalized = (mode ?? "agent").toLowerCase()
  // Plan: reads only. Chat: reads only. Agent: reads + writes.
  const allowWrite = normalized === "agent"
  return tools.filter((tool) => {
    const access = classifyComposioTool(tool.name, tool.requiresApproval)
    if (access === "read") return true
    if (access === "write") return allowWrite
    // Unknown: agent can try; chat/plan stay closed.
    return allowWrite
  })
}

export function canExecuteTool(
  mode: string | null | undefined,
  name: string,
  requiresApproval?: boolean | null,
): boolean {
  const access = classifyComposioTool(name, requiresApproval)
  const normalized = (mode ?? "agent").toLowerCase()
  if (access === "read") return true
  if (normalized !== "agent") return false
  return access === "write" || access === "unknown"
}

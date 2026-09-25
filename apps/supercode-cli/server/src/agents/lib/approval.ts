/**
 * Thin bridge from the agents harness to the existing permission manager.
 * Do not fork permission UX — keep a single source of truth.
 */
import {
  permissionManager,
  setCurrentAgent,
  getCurrentAgent,
  setParentAgent,
  getParentAgent,
} from "src/tools/permission-manager.ts"

export {
  permissionManager,
  setCurrentAgent,
  getCurrentAgent,
  setParentAgent,
  getParentAgent,
}

export async function checkToolPermission(
  toolName: string,
  args: Record<string, unknown>,
  opts?: { agentName?: string; parentAgent?: string },
): Promise<boolean> {
  const previous = getCurrentAgent()
  const previousParent = getParentAgent()
  if (opts?.agentName !== undefined) setCurrentAgent(opts.agentName)
  if (opts?.parentAgent !== undefined) setParentAgent(opts.parentAgent)
  try {
    return await permissionManager.check(toolName, args, {
      agentName: opts?.agentName,
    })
  } finally {
    setCurrentAgent(previous)
    setParentAgent(previousParent)
  }
}

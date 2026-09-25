/**
 * Chat mode helpers — permissions, display colors, agent mapping.
 */
import {
  permissionManager,
  setCurrentAgent,
} from "src/tools/permission-manager.ts"
import { theme } from "src/cli/utils/tui.ts"

export const MODES = ["chat", "plan", "agent"] as const
export type ChatMode = (typeof MODES)[number]

export const modeColors: Record<string, string> = {
  chat: theme.green,
  plan: theme.greenDim,
  agent: theme.amber,
}

export const modeDisplay: Record<string, string> = {
  chat: "chat",
  plan: "plan",
  agent: "agent",
}

/** Map chat-loop mode → agent name (or undefined for plain chat). */
export function agentForMode(mode: string): string | undefined {
  if (mode === "agent") return "build"
  if (mode === "plan") return "plan"
  return undefined
}

/**
 * Apply permission state for a mode:
 * - agent → sessionLevel allow + build agent
 * - plan → plan agent
 * - chat → default rules
 */
export function applyModePermissions(mode: string): void {
  permissionManager.setSessionLevel(mode === "agent" ? "allow" : null)
  setCurrentAgent(agentForMode(mode))
}

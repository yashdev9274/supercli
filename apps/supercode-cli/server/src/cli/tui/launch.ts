import { startOpenTui } from "./index.tsx"
import { bootstrapSession } from "src/cli/session/bootstrap.ts"
import { createSessionController } from "src/cli/session/session-controller.ts"
import { buildSystemPrompt } from "src/cli/workspace/context"

/** True when user opted into OpenTUI via env or CLI flag. */
export function wantsOpenTui(opts?: { tui?: string | boolean }): boolean {
  const env = (process.env.SUPERCODE_TUI || "").trim().toLowerCase()
  if (env === "opentui" || env === "1" || env === "true") return true
  if (opts?.tui === true) return true
  if (typeof opts?.tui === "string") {
    const v = opts.tui.trim().toLowerCase()
    return v === "opentui" || v === "1" || v === "true"
  }
  return false
}

/**
 * Start OpenTUI with full session bootstrap (auth, workspace, MCP) when possible.
 * Falls back to hello shell only if bootstrap fails before session creation.
 */
export async function launchOpenTuiHello(subtitle?: string): Promise<void> {
  // Prefer full session path
  const boot = await bootstrapSession(null)
  if (!boot.ok) {
    await startOpenTui({ subtitle: subtitle ?? `bootstrap failed: ${boot.reason}` })
    return
  }

  if (boot.workspaceInfo) {
    process.env.SUPERCODE_WORKSPACE_ROOT = boot.workspaceInfo.workspaceRoot
  }

  const system = boot.workspaceInfo
    ? buildSystemPrompt(boot.workspaceInfo, false)
    : undefined

  const session = createSessionController({
    provider: boot.provider,
    model: boot.model,
    mode: boot.mode === "agent" ? "build" : (boot.mode || "chat"),
    system,
  })

  await startOpenTui({
    subtitle:
      subtitle ??
      (boot.workspaceInfo
        ? `workspace ${boot.workspaceInfo.workspaceRoot}`
        : undefined),
    session,
    provider: boot.provider,
    model: boot.model,
    mode: boot.mode === "agent" ? "build" : boot.mode,
  })
}

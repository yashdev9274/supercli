import { Command } from "commander"
import { startChat, type ModelProvider } from "src/cli/ai/chat/chat"
import { startAgentChat } from "src/cli/ai/chat/chatAgent"
import { bootstrapSession } from "src/cli/session/bootstrap.ts"

/** True when user opted into OpenTUI via env or CLI flag. */
function wantsOpenTui(opts?: { tui?: string | boolean }): boolean {
  const env = (process.env.SUPERCODE_TUI || "").trim().toLowerCase()
  if (env === "opentui" || env === "1" || env === "true") return true
  if (opts?.tui === true) return true
  if (typeof opts?.tui === "string") {
    const v = opts.tui.trim().toLowerCase()
    return v === "opentui" || v === "1" || v === "true"
  }
  return false
}

export const wakeUpAction = async (
  resumeId: string | null = null,
  opts: { tui?: string | boolean } = {},
) => {
  // OpenTUI is Bun + native FFI — load only when requested so Node dist stays chalk-safe.
  if (wantsOpenTui(opts)) {
    const { launchOpenTuiHello } = await import("src/cli/tui/launch.ts")
    await launchOpenTuiHello(resumeId ? `resume ${resumeId}` : undefined)
    return
  }

  const boot = await bootstrapSession(resumeId)
  if (!boot.ok) return

  if (boot.resumeId && boot.mode === "agent") {
    await startAgentChat(
      boot.provider as ModelProvider,
      boot.model,
      boot.resumeId,
      boot.workspaceInfo ?? undefined,
    )
  } else {
    await startChat(
      boot.provider as ModelProvider,
      boot.model,
      boot.resumeId,
      boot.workspaceInfo ?? undefined,
      "chat",
    )
  }
}

export const supercodeInit = new Command("init")
  .description("Start supercode interactive session")
  .option(
    "--resume <conversationId>",
    "Resume a previous conversation by ID",
  )
  .option(
    "--tui [engine]",
    "Use OpenTUI shell (opentui). Env SUPERCODE_TUI=opentui also enables it. Requires Bun.",
  )
  .action(async (opts: { resume?: string; tui?: string | boolean }) => {
    await wakeUpAction(opts.resume ?? null, { tui: opts.tui })
  })

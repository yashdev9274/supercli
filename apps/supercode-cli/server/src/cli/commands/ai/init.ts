import { Command } from "commander"
import { version } from "../../../../package.json"
import { getStoredToken } from "src/lib/token"
import { getCurrentUser } from "src/lib/api-client"
import { startChat, type ModelProvider } from "src/cli/ai/chat/chat"
import { startAgentChat } from "src/cli/ai/chat/chatAgent"
import { theme, frame, createThinking, errorBox } from "src/cli/utils/tui"
import { renderWelcome } from "src/cli/utils/welcome"
import { scanWorkspace } from "src/cli/workspace/scanner.ts"
import { renderWorkspaceBanner } from "src/cli/workspace/format.ts"
import { getCliConfig, saveCliConfig, applyStoredApiKeys } from "src/lib/cli-config"
import { checkForUpdate } from "src/cli/utils/auto-update"

export const wakeUpAction = async (resumeId: string | null = null) => {
  renderWelcome(version)

  const token = await getStoredToken()

  if (!token?.access_token) {
    console.log()
    console.log(errorBox("Not authenticated. Run supercode login first"))
    console.log()
    return
  }

  const thinking = createThinking("authenticating")
  const result = await getCurrentUser()

  if (!result.ok) {
    const msg = result.reason === "unauthorized"
      ? "Session expired. Run supercode login to re-authenticate"
      : "Server was inactive and is waking up. Wait a minute, then run supercode init again"
    thinking.fail(msg)
    return
  }

  const user = result.user
  thinking.succeed(`Welcome, ${user.name}`)

  await checkForUpdate()

  const wsThinking = createThinking("scanning workspace")
  let workspaceInfo = null
  try {
    workspaceInfo = await scanWorkspace()
    wsThinking.succeed()
    console.log()
    console.log(frame(renderWorkspaceBanner(workspaceInfo), { borderColor: theme.dim, padding: 0 }))
    console.log()
  } catch (err) {
    wsThinking.fail("Could not scan workspace")
  }

  const stored = await getCliConfig()
  await applyStoredApiKeys()
  if (stored) {
    switch (stored.mode) {
      case "agent":
        await startAgentChat(stored.provider, stored.model, resumeId, workspaceInfo ?? undefined)
        break
      default:
        await startChat(stored.provider, stored.model, resumeId, workspaceInfo ?? undefined, stored.mode)
        break
    }
    return
  }

  const defaults = await saveCliConfig({})
  switch (defaults.mode) {
    case "agent":
      await startAgentChat(defaults.provider, defaults.model, resumeId, workspaceInfo ?? undefined)
      break
    default:
      await startChat(defaults.provider, defaults.model, resumeId, workspaceInfo ?? undefined, defaults.mode)
      break
  }
}

export const supercodeInit = new Command("init")
  .description("Start supercode interactive session")
  .option(
    "--resume <conversationId>",
    "Resume a previous conversation by ID",
  )
  .action(async (opts: { resume?: string }) => {
    await wakeUpAction(opts.resume ?? null)
  })

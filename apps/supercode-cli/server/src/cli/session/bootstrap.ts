import { version } from "../../../package.json"
import { getStoredToken } from "src/lib/token"
import { getCurrentUser } from "src/lib/api-client"
import { getMcpManager } from "src/mcp/mcp-manager"
import { composioSessionManager } from "src/mcp/composio"
import { mergeConnectorManager } from "src/connectors"
import { createThinking, errorBox } from "src/cli/utils/tui"
import { renderWelcome } from "src/cli/utils/welcome"
import { scanWorkspace } from "src/cli/workspace/scanner.ts"
import { getCliConfig, saveCliConfig, applyStoredApiKeys } from "src/lib/cli-config"
import { checkForUpdate } from "src/cli/utils/auto-update"
import { checkPaidTierInterest } from "src/cli/utils/paid-tier-check"
import { CLOUD_MODELS } from "src/cli/commands/slashCommands/model"
import type { ModelProvider } from "src/cli/ai/chat/chat"

export type BootstrapResult =
  | { ok: false; reason: string }
  | {
      ok: true
      provider: ModelProvider
      model: string
      mode: "chat" | "agent" | string
      workspaceInfo: Awaited<ReturnType<typeof scanWorkspace>> | null
      resumeId: string | null
    }

/**
 * Wake-up path shared by chalk and OpenTUI sessions.
 * Calls frozen auth/billing helpers; does not rewrite them.
 */
export async function bootstrapSession(resumeId: string | null = null): Promise<BootstrapResult> {
  renderWelcome(version)

  const token = await getStoredToken()
  if (!token?.access_token) {
    console.log()
    console.log(errorBox("Not authenticated. Run supercode login first"))
    console.log()
    return { ok: false, reason: "unauthenticated" }
  }

  const thinking = createThinking("authenticating")
  const result = await getCurrentUser()

  if (!result.ok) {
    const msg =
      result.reason === "unauthorized"
        ? "Session expired. Run supercode login to re-authenticate"
        : "Server was inactive and is waking up. Wait a minute, then run supercode init again"
    thinking.fail(msg)
    return { ok: false, reason: result.reason === "unauthorized" ? "unauthorized" : "server_waking" }
  }

  const user = result.user
  thinking.succeed(`Welcome, ${user.name}`)

  await checkForUpdate()
  await checkPaidTierInterest()

  const wsThinking = createThinking("scanning workspace")
  let workspaceInfo: Awaited<ReturnType<typeof scanWorkspace>> | null = null
  try {
    workspaceInfo = await scanWorkspace()
    wsThinking.succeed()
  } catch {
    wsThinking.fail("Could not scan workspace")
  }

  const stored = await getCliConfig()
  await applyStoredApiKeys()

  // Auto-restore composio MCP session — try server-side first, then local SDK
  try {
    const info = await composioSessionManager.createSessionFromServer()
    await getMcpManager().start({
      composio: { url: info.url, headers: info.headers },
    })
  } catch {
    if (composioSessionManager.isConfigured) {
      try {
        const info = await composioSessionManager.createSession("supercode-cli")
        await getMcpManager().start({
          composio: { url: info.url, headers: info.headers },
        })
      } catch {
        // composio auto-reconnect failed — user can use /mcp to reconnect
      }
    }
  }

  // Auto-connect Merge Agent Handler (silent — no user-facing output)
  if (mergeConnectorManager.isConfigured) {
    mergeConnectorManager.loadConfigFromEnv()
    const mcpConfig = mergeConnectorManager.getMcpConfig()
    if (mcpConfig) {
      try {
        await getMcpManager().start({ mergedev: mcpConfig })
      } catch {
        // Merge AH auto-connect failed — tools degrade gracefully
      }
    }
  }

  if (stored) {
    const BYOK_PROVIDER_VARS: Record<string, string[]> = {
      concentrateai: ["CONCENTRATE_BYOK_PROD_KEY", "CONCENTRATE_BYOK_DEV_KEY"],
      mergedev: ["MERGE_DEV_BYOK_PROD_KEY", "MERGE_DEV_BYOK_DEV_KEY"],
      google: ["GOOGLE_BYOK_PROD_KEY", "GOOGLE_BYOK_DEV_KEY"],
      openrouter: ["OPENROUTER_BYOK_PROD_KEY", "OPENROUTER_BYOK_DEV_KEY"],
      nvidia: ["NVIDIA_BYOK_PROD_KEY", "NVIDIA_BYOK_DEV_KEY"],
    }
    const CLOUD_MODEL_NAMES = new Set(CLOUD_MODELS.map((m) => m.value))
    const sp = stored.provider
    const byokVars = sp && BYOK_PROVIDER_VARS[sp]
    if (byokVars && !byokVars.some((v) => process.env[v])) {
      stored.model = CLOUD_MODEL_NAMES.has(stored.model) ? stored.model : "deepseek-v4-flash"
      stored.provider = "supercode"
      await saveCliConfig({ provider: "supercode", model: stored.model })
    } else if (sp === "supercode" && !CLOUD_MODEL_NAMES.has(stored.model)) {
      stored.model = "deepseek-v4-flash"
      await saveCliConfig({ model: stored.model })
    }

    return {
      ok: true,
      provider: stored.provider as ModelProvider,
      model: stored.model,
      mode: stored.mode ?? "chat",
      workspaceInfo,
      resumeId,
    }
  }

  const defaults = await saveCliConfig({})
  return {
    ok: true,
    provider: defaults.provider as ModelProvider,
    model: defaults.model,
    mode: "chat",
    workspaceInfo,
    resumeId,
  }
}

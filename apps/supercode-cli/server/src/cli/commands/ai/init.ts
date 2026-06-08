import chalk from "chalk"
import { Command } from "commander"
import { getStoredToken } from "src/lib/token"
import { getCurrentUser } from "src/lib/api-client"
import { select, isCancel } from "@clack/prompts"
import { startChat, type ModelProvider } from "src/cli/ai/chat/chat"
import { startAgentChat } from "src/cli/ai/chat/chatAgent"
import { theme, frame, createThinking, errorBox } from "src/cli/utils/tui"
import { scanWorkspace } from "src/cli/workspace/scanner.ts"
import { renderWorkspaceBanner, renderFileTree } from "src/cli/workspace/format.ts"

const NVIDIA_MODELS = {
  "minimaxai/minimax-m2.7": "MiniMax M2.7",
  "deepseek-ai/deepseek-v4-flash": "DeepSeek V4 Flash",
  "meta/llama-3.3-70b-instruct": "Llama 3.3 70B",
} as const

const OPENROUTER_MODELS = {
  "openai/gpt-oss-120b:free": "GPT OSS 120B (free)",
  "deepseek/deepseek-v4-flash": "DeepSeek V4 Flash",
  "minimax/minimax-m3": "MiniMax M3",
  "z-ai/glm-5.1": "GLM 5.1",
  "moonshotai/kimi-k2.6:free": "Kimi K2.6 (free)",
} as const

export const wakeUpAction = async () => {
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

  let modelChoice: ModelProvider
  let selectedModel: string | undefined

  const providerChoice = await select({
    message: chalk.hex(theme.cyan)("select model"),
    options: [
      // { value: "server", label: "Supercloud", hint: "server-hosted · no API key needed (Recommended)" },
      { value: "google", label: "Gemini 2.5 Flash", hint: "free · fast" },
      { value: "minimax", label: "MiniMax M2", hint: "reasoning · powerful" },
      { value: "openrouter", label: "OpenRouter", hint: "multi-provider · bring your own key" },
      { value: "nvidia", label: "NVIDIA NIM", hint: "free API" },
    ],
  })

  if (isCancel(providerChoice)) {
    console.log(chalk.hex(theme.muted)("cancelled"))
    process.exit(0)
  }

  console.log()

  if (providerChoice === "nvidia") {
    const nvidiaModel = await select({
      message: chalk.hex(theme.cyan)("select NVIDIA NIM model"),
      options: Object.entries(NVIDIA_MODELS).map(([value, label]) => ({
        value,
        label,
      })),
    })

    if (isCancel(nvidiaModel)) {
      console.log(chalk.hex(theme.muted)("cancelled"))
      process.exit(0)
    }

    modelChoice = "nvidia"
    selectedModel = nvidiaModel as string
    console.log()
  } else if (providerChoice === "openrouter") {
    const orModel = await select({
      message: chalk.hex(theme.cyan)("select OpenRouter model"),
      options: Object.entries(OPENROUTER_MODELS).map(([value, label]) => ({
        value,
        label,
      })),
    })

    if (isCancel(orModel)) {
      console.log(chalk.hex(theme.muted)("cancelled"))
      process.exit(0)
    }

    modelChoice = "openrouter"
    selectedModel = orModel as string
    console.log()
  } else {
    modelChoice = providerChoice as ModelProvider
  }

  const modeChoice = await select({
    message: chalk.hex(theme.cyan)("select mode"),
    options: [
      { value: "chat", label: "Chat", hint: "conversation with AI" },
      { value: "tools", label: "Tools", hint: "AI with file read & search" },
      { value: "agent", label: "Agent", hint: "autonomous coding agent (coming soon)" },
    ],
  })

  if (isCancel(modeChoice)) {
    console.log(chalk.hex(theme.muted)("cancelled"))
    process.exit(0)
  }

  console.log()

  switch (modeChoice) {
    case "agent":
      await startAgentChat(modelChoice, selectedModel)
      break
    default:
      await startChat(modelChoice, selectedModel, null, workspaceInfo ?? undefined, modeChoice as string)
      break
  }
}

export const supercodeInit = new Command("init")
  .description("Start supercode interactive session")
  .action(wakeUpAction)

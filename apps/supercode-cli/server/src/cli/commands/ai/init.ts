import chalk from "chalk"
import { Command } from "commander"
import { getStoredToken } from "src/lib/token"
import prisma from "@super/db-terminal"
import { select, isCancel } from "@clack/prompts"
import { startChat, type ModelProvider } from "src/cli/ai/chat/chat"
import { theme, frame, createThinking } from "src/cli/utils/tui"

const NVIDIA_MODELS = {
  "minimaxai/minimax-m2.7": "MiniMax M2.7",
  "deepseek-ai/deepseek-v4-flash": "DeepSeek V4 Flash",
  "meta/llama-3.3-70b-instruct": "Llama 3.3 70B",
} as const

const OPENROUTER_MODELS = {
  "openai/gpt-oss-120b:free": "GPT OSS 120B (free)",
  "deepseek/deepseek-v4-flash": "DeepSeek V4 Flash",
} as const

export const wakeUpAction = async () => {
  const token = await getStoredToken()

  if (!token?.access_token) {
    console.log(chalk.hex(theme.red)("Not authenticated. Please login first"))
    return
  }

  const thinking = createThinking("fetching user")
  const user = await prisma.user.findFirst({
    where: {
      sessions: { some: { token: token.access_token } },
    },
    select: { id: true, name: true, email: true, image: true },
  })

  if (!user) {
    thinking.fail("User not found")
    return
  }

  thinking.succeed(`Welcome, ${user.name}`)
  console.log()

  let modelChoice: ModelProvider
  let selectedModel: string | undefined

  const providerChoice = await select({
    message: chalk.hex(theme.cyan)("select model"),
    options: [
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
      { value: "tools", label: "Tools", hint: "AI with search & code execution" },
      { value: "agent", label: "Agent", hint: "autonomous coding agent (coming soon)" },
    ],
  })

  if (isCancel(modeChoice)) {
    console.log(chalk.hex(theme.muted)("cancelled"))
    process.exit(0)
  }

  console.log()

  switch (modeChoice) {
    case "chat":
      await startChat(modelChoice, selectedModel)
      break
    case "tools":
      console.log(frame(` ${chalk.hex(theme.warning)("tools mode coming soon")} `, { borderColor: theme.dim, padding: 0 }))
      break
    case "agent":
      console.log(frame(` ${chalk.hex(theme.warning)("agent mode coming soon")} `, { borderColor: theme.dim, padding: 0 }))
      break
  }
}

export const supercodeInit = new Command("init")
  .description("Start supercode interactive session")
  .action(wakeUpAction)

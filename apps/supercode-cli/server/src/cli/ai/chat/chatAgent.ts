import prisma from "@super/db-terminal"
import chalk from "chalk"
import { text, confirm, isCancel } from "@clack/prompts"
import { createThinking, theme, userMessage, streamFooter, streamHeader } from "src/cli/utils/tui"
import { getStoredToken } from "src/lib/token"
import { ChatService } from "src/service/chat-service"
import { createProvider, type ModelProvider } from "src/cli/ai/provider"
import { createAppAgent } from "src/config/agent-config"
import { agentService } from "src/agent"

let _chatService: ChatService

function getChatService() {
  if (!_chatService) _chatService = new ChatService()
  return _chatService
}

async function getUserFromToken() {
  const token = await getStoredToken()

  if (!token?.access_token) {
    console.log(chalk.hex(theme.red)("Not authenticated. Please login first."))
    process.exit(1)
  }

  const thinking = createThinking("authenticating")
  const user = await prisma.user.findFirst({
    where: {
      sessions: { some: { token: token.access_token as string } },
    },
    select: { id: true, name: true, email: true },
  })

  if (!user) {
    thinking.fail("User not found")
    throw new Error("User not found. Please try again.")
  }

  thinking.succeed(`Welcome, ${user.name}`)
  return user
}

async function initAgentConversation(userId: string, conversationId: string | null = null) {
  const thinking = createThinking("loading conversation")
  const conversation = await getChatService().getOrCreateConversation(
    userId,
    conversationId ?? undefined,
    "agent",
  )
  thinking.succeed()

  const w = process.stdout.columns ?? 80
  const header = ` ${chalk.hex(theme.warning)("┃")} ${chalk.hex(theme.warning).bold(conversation.title ?? "Untitled")} ${chalk.hex(theme.muted)(`· ${conversation.id.slice(0, 12)} · agent mode ──`)}`
  const desc = ` ${chalk.hex(theme.warning)("┃")} ${chalk.hex(theme.muted)("creates apps by executing commands step-by-step")}`

  console.log()
  console.log(header)
  console.log(desc)
  console.log()

  return conversation
}

interface Conversation {
  id: string
  title: string | null
  mode: string
  userId: string
  createdAt: Date
  updatedAt: Date
}

async function agentLoop(
  conversation: Conversation,
  model: import("ai").LanguageModel,
) {
  console.log(` ${chalk.hex(theme.warning)("◆")} ${chalk.hex(theme.muted)("Describe an application to generate")}`)
  console.log(` ${chalk.hex(theme.muted)('•')} Type "exit" to end`)
  console.log()

  while (true) {
    const userInput = await text({
      message: chalk.hex(theme.warning)("what would you like to build?"),
      placeholder: "Describe your application...",
      validate(value: string | undefined) {
        if (!value || value.trim().length === 0) {
          return "Description cannot be empty"
        }
        if (value.trim().length < 10) {
          return "Please provide more details (at least 10 characters)"
        }
      },
    })

    if (isCancel(userInput)) {
      console.log()
      console.log(chalk.hex(theme.amber)("◆") + " " + chalk.hex(theme.muted)("agent session cancelled"))
      process.exit(0)
    }

    if (userInput.toLowerCase() === "exit") {
      console.log()
      console.log(chalk.hex(theme.amber)("◆") + " " + chalk.hex(theme.muted)("agent session ended"))
      break
    }

    userMessage(userInput)
    await saveMessage(conversation.id, "user", userInput)

    const startTime = Date.now()

    try {
      const agent = createAppAgent(model)

      const thinking = createThinking("generating")

      let lastToolCall = ""

      const result = await agent.generate({
        prompt: userInput,
        onStepFinish: async ({ stepNumber, text, toolCalls, finishReason }) => {
          if (toolCalls?.length) {
            for (const tc of toolCalls) {
              const label = `${tc.toolName}(${JSON.stringify((tc as any).input)})`
              if (label !== lastToolCall) {
                lastToolCall = label
                thinking.setLabel(tc.toolName)
              }
            }
          }
        },
      })

      thinking.succeed("done")
      const w = process.stdout.columns ?? 80
      const dim = (s: string) => chalk.hex(theme.greenDim)(s)
      console.log(` ${chalk.hex(theme.green)("┃")} ${chalk.hex(theme.green).bold("Result")} ${dim("─".repeat(Math.max(0, w - 15)))}`)
      console.log(chalk.white(result.text || "Application created successfully."))
      console.log()

      const responseMessage = result.text || "Application created successfully."
      await saveMessage(conversation.id, "assistant", responseMessage)

      const elapsed = Date.now() - startTime
      streamFooter(undefined, elapsed)

      const continueApp = await confirm({
        message: chalk.hex(theme.cyan)("Would you like to generate another application?"),
        initialValue: false,
      })

      if (isCancel(continueApp) || !continueApp) {
        console.log()
        console.log(chalk.hex(theme.green)("◆") + " " + chalk.hex(theme.muted)("Check your new application!"))
        break
      }
    } catch (error: any) {
      console.log()
      console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(error?.message ?? "Error")}`)
      console.log()

      await saveMessage(
        conversation.id,
        "assistant",
        `Error: ${error?.message ?? "Unknown error"}`,
      )

      const retry = await confirm({
        message: chalk.hex(theme.cyan)("Would you like to try again?"),
        initialValue: true,
      })

      if (isCancel(retry) || !retry) {
        break
      }
    }
  }
}

async function saveMessage(conversationId: string, role: string, content: string) {
  return getChatService().addMessage(conversationId, role, content)
}

export async function startAgentChat(
  provider: ModelProvider = "concentrateai",
  model?: string,
  conversationId: string | null = null,
) {
  try {
    const w = process.stdout.columns ?? 80
    const title = ` ${chalk.hex(theme.warning)("┃")} ${chalk.hex(theme.warning).bold("supercode")} ${chalk.hex(theme.muted)("· agent mode ──")}`
    const fillLen = Math.max(0, w - title.length - 1)
    console.log(`\n${title}${chalk.hex(theme.greenDim)("─".repeat(fillLen))}`)
    console.log()

    const user = await getUserFromToken()
    console.log()

    const confirmPrompt = await confirm({
      message: chalk.hex(theme.amber)("The agent will create files and run commands in the current directory. Continue?"),
      initialValue: true,
    })

    if (isCancel(confirmPrompt) || !confirmPrompt) {
      console.log(chalk.hex(theme.muted)("agent mode cancelled"))
      process.exit(0)
    }

    const aiProvider = createProvider(provider, model)
    const languageModel = aiProvider.model as import("ai").LanguageModel | null

    if (!languageModel) {
      console.log(chalk.hex(theme.red)(`Agent mode requires a model with tool support. ${provider} provider does not export a compatible model.`))
      process.exit(1)
    }

    const conversation = await initAgentConversation(user.id, conversationId)
    await agentLoop(conversation, languageModel)

    console.log()
    console.log(chalk.hex(theme.green)("◆") + " " + chalk.hex(theme.muted)("agent session ended"))
  } catch (error) {
    console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(error instanceof Error ? error.message : String(error))}`)
    process.exit(1)
  }
}

import prisma from "@super/db-terminal"
import chalk from "chalk"
import { text, confirm, isCancel } from "@clack/prompts"
import { createThinking, theme, frame, panel, userMessage, streamFooter } from "src/cli/utils/tui"
import { getStoredToken } from "src/lib/token"
import { ChatService } from "src/service/chat-service"
import { createProvider, type ModelProvider } from "src/cli/ai/provider"
import { generateApplication } from "src/config/agent-config"

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

  const detail = [
    chalk.hex(theme.text).bold(conversation.title ?? "Untitled"),
    chalk.hex(theme.muted)(`${conversation.id.slice(0, 12)} · agent mode`),
    chalk.hex(theme.warning)("generates complete applications from descriptions"),
  ]

  console.log()
  console.log(panel(detail.join("\n"), { title: "session" }))
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

async function agentLoop(conversation: Conversation, model: import("ai").LanguageModel) {
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
      const result = await generateApplication(userInput, model, process.cwd())

      if (result && result.success) {
        const responseMessage =
          `Generated application: ${result.folderName}\n` +
          `Files created: ${result.files.length}\n` +
          `Location: ${result.appDir}\n\n` +
          `Setup commands:\n${result.commands.join("\n")}`

        await saveMessage(conversation.id, "assistant", responseMessage)

        const elapsed = Date.now() - startTime
        streamFooter(undefined, elapsed)
        console.log()

        const continuePrompt = await confirm({
          message: chalk.hex(theme.cyan)("Would you like to generate another application?"),
          initialValue: false,
        })

        if (isCancel(continuePrompt) || !continuePrompt) {
          console.log()
          console.log(chalk.hex(theme.green)("◆") + " " + chalk.hex(theme.muted)("Check your new application!"))
          break
        }
      } else {
        throw new Error("Generation returned no result")
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

async function updateConversationTitle(conversationId: string, userInput: string, messageCount: number) {
  if (messageCount !== 1) return
  const baseTitle = userInput.slice(0, 50)
  await getChatService().updateTitle(conversationId, userInput.length > 50 ? `${baseTitle}...` : baseTitle)
}

export async function startAgentChat(
  provider: ModelProvider = "google",
  model?: string,
  conversationId: string | null = null,
) {
  try {
    console.log(
      frame(
        ` ${chalk.hex(theme.warning).bold("supercode")} ${chalk.hex(theme.muted)("· agent mode")} `,
        { borderColor: theme.warning },
      ),
    )
    console.log()

    const user = await getUserFromToken()
    console.log()

    const confirmPrompt = await confirm({
      message: chalk.hex(theme.amber)("The agent will create files and folders in the current directory. Continue?"),
      initialValue: true,
    })

    if (isCancel(confirmPrompt) || !confirmPrompt) {
      console.log(chalk.hex(theme.muted)("agent mode cancelled"))
      process.exit(0)
    }

    const aiProvider = createProvider(provider, model)
    if (!aiProvider.model) {
      console.log(chalk.hex(theme.red)(`Agent mode is not supported with ${provider} provider (no structured output support)`))
      process.exit(1)
    }
    const conversation = await initAgentConversation(user.id, conversationId)
    await agentLoop(conversation, aiProvider.model as import("ai").LanguageModel)

    console.log()
    console.log(chalk.hex(theme.green)("◆") + " " + chalk.hex(theme.muted)("agent session ended"))
  } catch (error) {
    console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(error instanceof Error ? error.message : String(error))}`)
    process.exit(1)
  }
}

import prisma from "@super/db-terminal"
import chalk from "chalk"
import { intro, multiselect, outro, isCancel, cancel, text } from "@clack/prompts"
import boxen from "boxen"
import { marked } from "marked"
import { createThinking, theme } from "src/cli/utils/tui"
import { getStoredToken } from "src/lib/token"
import { ChatService } from "src/service/chat-service"
import { createProvider } from "src/cli/ai/provider"
import { initConversation } from "src/cli/ai/chat/chat"
import { enableTools, resetTools, availableTools, getEnabledToolNames } from "src/config/tools.config"
import yoctoSpinner from "yocto-spinner"

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

async function getAIResponse(conversationId: string): Promise<string> {
  const dbMessages = await getChatService().getMessages(conversationId)
  const messages = getChatService().formatMessagesForAI(dbMessages)
  const provider = createProvider("google")
  const result = await provider.sendMessage(messages as any)
  return result.content
}

async function selectTools() {
  const toolOptions = availableTools.map(tool => ({
    value: tool.id,
    label: tool.name,
    hint: tool.description,
  }))

  const selectedTools = await multiselect({
    message: chalk.cyan(
      "Select tools to enable (Space to select, Enter to confirm):"
    ),
    options: toolOptions,
    required: false,
  })

  if (isCancel(selectedTools)) {
    cancel(chalk.yellow("Tool selection cancelled"))
    process.exit(0)
  }

  const selected = selectedTools as string[]
  enableTools(selected)

  if (selected.length === 0) {
    console.log(
      chalk.yellow(
        "\n\u26A0 No tools selected. AI will work without tools.\n"
      )
    )
  } else {
    const toolsBox = boxen(
      chalk.green(
        "\u2705 Enabled tools:\n" +
        selected
          .map((id: string) => {
            const tool = availableTools.find(t => t.id === id)
            return tool ? `\u2022 ${tool.name}` : null
          })
          .filter(Boolean)
          .join("\n")
      ),
      {
        padding: 1,
        margin: { top: 1, bottom: 1 },
        borderStyle: "round",
        borderColor: "green",
        title: "\uD83D\uDEE0 Active Tools",
        titleAlignment: "center",
      }
    )

    console.log(toolsBox)
  }
}

async function initToolConversation(userId: string, conversationId: string | null = null) {
  const spinner = yoctoSpinner({ text: "Loading conversation..." }).start()

  const conversation = await getChatService().getOrCreateConversation(
    userId,
    conversationId ?? undefined,
    "tool"
  )

  spinner.success("Conversation loaded")

  const enabledToolNames = getEnabledToolNames()
  const toolsDisplay =
    enabledToolNames.length > 0
      ? `\n${chalk.gray("Active Tools:")} ${enabledToolNames.join(", ")}`
      : `\n${chalk.gray("No tools enabled")}`

  const conversationInfo = boxen(
    `${chalk.bold("Conversation")}: ${conversation.title}\n${chalk.gray(
      "ID: " + conversation.id
    )}\n${chalk.gray("Mode: " + conversation.mode)}${toolsDisplay}`,
    {
      padding: 1,
      margin: { top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "cyan",
      title: "\uD83D\uDCAC Tool Calling Session",
      titleAlignment: "center",
    }
  )

  console.log(conversationInfo)

  return conversation
}

async function saveMessage(conversationId: string, role: string, content: string) {
  return getChatService().addMessage(conversationId, role, content)
}

async function updateConversationTitle(conversationId: string, userInput: string, messageCount: number) {
  if (messageCount !== 1) return
  const baseTitle = userInput.slice(0, 50)
  await getChatService().updateTitle(conversationId, userInput.length > 50 ? `${baseTitle}...` : baseTitle)
}

interface Conversation {
  id: string
  title: string | null
  mode: string
  userId: string
  createdAt: Date
  updatedAt: Date
}

async function toolChatLoop(conversation: Conversation) {
  const enabledToolNames = getEnabledToolNames()
  const helpBox = boxen(
    `${chalk.gray("\u2022 Type your message and press Enter")}\n` +
    `${chalk.gray("AI has access to:")} ${
      enabledToolNames.length > 0
        ? enabledToolNames.join(", ")
        : "No tools"
    }\n` +
    `${chalk.gray('Type "exit" to end conversation')}\n` +
    `${chalk.gray("Press Ctrl+C to quit anytime")}`,
    {
      padding: 1,
      margin: { bottom: 1 },
      borderStyle: "round",
      borderColor: "gray",
      dimBorder: true,
    }
  )

  console.log(helpBox)

  while (true) {
    const userInput = await text({
      message: chalk.blue("\uD83D\uDDE3 Your message"),
      placeholder: "Type your message...",
      validate(value: string | undefined) {
          if (!value || value.trim().length === 0) {
            return "Message cannot be empty"
          }
        },
    })

    if (isCancel(userInput)) {
      const exitBox = boxen(
        chalk.yellow("Chat session ended. Goodbye! \uD83D\uDC4B"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "yellow",
        }
      )
      console.log(exitBox)
      process.exit(0)
    }

    if (userInput.toLowerCase() === "exit") {
      const exitBox = boxen(
        chalk.yellow("Chat session ended. Goodbye! \uD83D\uDC4B"),
        {
          padding: 1,
          margin: 1,
          borderStyle: "round",
          borderColor: "yellow",
        }
      )
      console.log(exitBox)
      break
    }

    const userBox = boxen(chalk.white(userInput), {
      padding: 1,
      margin: { left: 2, top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "blue",
      title: " \uD83D\uDC64 You",
      titleAlignment: "left",
    })
    console.log(userBox)

    await saveMessage(conversation.id, "user", userInput)

    const spinner = yoctoSpinner({ text: "AI thinking..." }).start()
    const aiResponse = await getAIResponse(conversation.id)
    spinner.stop()

    await saveMessage(conversation.id, "assistant", aiResponse)

    const assistantBox = boxen(chalk.white(aiResponse), {
      padding: 1,
      margin: { left: 2, top: 1, bottom: 1 },
      borderStyle: "round",
      borderColor: "green",
      title: " \uD83E\uDD16 AI",
      titleAlignment: "left",
    })
    console.log(assistantBox)

    const msgCount = (await getChatService().getMessages(conversation.id)).length
    await updateConversationTitle(conversation.id, userInput, msgCount)
  }
}

export async function startToolChat(conversationId: string | null = null) {
  try {
    intro(
      boxen(chalk.bold.cyan("Supercode AI - Tool Calling Mode"), {
        padding: 1,
        borderStyle: "double",
        borderColor: "cyan",
      })
    )

    const user = await getUserFromToken()
    await selectTools()
    const conversation = await initToolConversation(user.id, conversationId)
    await toolChatLoop(conversation)
    resetTools()
    outro(chalk.green("Thanks for using tools"))
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    const errorBox = boxen(chalk.red(`Error: ${errMsg}`), {
      padding: 1,
      margin: 1,
      borderStyle: "round",
      borderColor: "red",
    })

    console.log(errorBox)
    resetTools()
    process.exit(1)
  }
}

import prisma from "../../../lib/prisma"
import chalk from "chalk"
import { multiselect, isCancel, text } from "@clack/prompts"
import { createThinking, theme, frame, panel, userMessage, streamFooter, streamHeader } from "src/cli/utils/tui"
import { getStoredToken } from "src/lib/token"
import { ChatService } from "src/service/chat-service"
import { createProvider } from "src/cli/ai/provider"
import { enableTools, resetTools, availableTools, getEnabledToolNames } from "src/config/tools.config"

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

async function getAIResponse(conversationId: string, onChunk?: (chunk: string) => void): Promise<string> {
  const dbMessages = await getChatService().getMessages(conversationId)
  const messages = getChatService().formatMessagesForAI(dbMessages)
  const provider = createProvider("concentrateai")
  const result = await provider.sendMessage(
    messages as any,
    onChunk,
  )
  return result.content
}

async function selectTools() {
  const toolOptions = availableTools.map(tool => ({
    value: tool.id,
    label: tool.name,
    hint: tool.description,
  }))

  const selectedTools = await multiselect({
    message: chalk.hex(theme.cyan)("Select tools to enable (Space to select, Enter to confirm):"),
    options: toolOptions,
    required: false,
  })

  if (isCancel(selectedTools)) {
    console.log(chalk.hex(theme.muted)("cancelled"))
    process.exit(0)
  }

  const selected = selectedTools as string[]
  enableTools(selected)

  if (selected.length > 0) {
    const names = selected
      .map((id: string) => availableTools.find(t => t.id === id))
      .filter(Boolean)
      .map(t => chalk.hex(theme.green)(t!.name))
    console.log(`  ${chalk.hex(theme.muted)("tools:")} ${names.join(chalk.hex(theme.dim)(" · "))}`)
  }
}

async function initToolConversation(userId: string, conversationId: string | null = null) {
  const thinking = createThinking("loading conversation")
  const conversation = await getChatService().getOrCreateConversation(
    userId,
    conversationId ?? undefined,
    "tool"
  )
  thinking.succeed()

  const enabledToolNames = getEnabledToolNames()
  const detail = [
    chalk.hex(theme.text).bold(conversation.title ?? "Untitled"),
    chalk.hex(theme.muted)(`${conversation.id.slice(0, 12)} · tool mode`),
  ]
  if (enabledToolNames.length > 0) {
    detail.push(chalk.hex(theme.green)(`tools: ${enabledToolNames.join(", ")}`))
  }

  console.log()
  console.log(
    panel(detail.join("\n"), { title: "session" })
  )
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

async function toolChatLoop(conversation: Conversation) {
  console.log(` ${chalk.hex(theme.muted)("•")} Type your message`)
  console.log(` ${chalk.hex(theme.muted)('•')} Type "exit" to end`)
  console.log()

  while (true) {
    const userInput = await text({
      message: chalk.hex(theme.cyan)("your message"),
      placeholder: "Type your message...",
      validate(value: string | undefined) {
        if (!value || value.trim().length === 0) {
          return "Message cannot be empty"
        }
      },
    })

    if (isCancel(userInput)) {
      console.log()
      console.log(` ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.muted)("session ended")}`)
      process.exit(0)
    }

    if (userInput.toLowerCase() === "exit") {
      console.log()
      console.log(` ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.muted)("session ended")}`)
      break
    }

    userMessage(userInput)
    await saveMessage(conversation.id, "user", userInput)

    const startTime = Date.now()
    let fullResponse = ""
    let isFirstChunk = true
    const modelName = "concentrateai"

    const thinking = createThinking("thinking")

    const aiResponse = await getAIResponse(
      conversation.id,
      (chunk) => {
        if (isFirstChunk) {
          thinking.stop()
          isFirstChunk = false
          streamHeader(modelName)
        }
        process.stdout.write(chunk)
        fullResponse += chunk
      }
    )

    const elapsed = Date.now() - startTime
    if (isFirstChunk) {
      thinking.stop()
      streamHeader(modelName)
      process.stdout.write(fullResponse)
    }

    streamFooter(undefined, elapsed)

    await saveMessage(conversation.id, "assistant", aiResponse)

    const msgCount = (await getChatService().getMessages(conversation.id)).length
    await updateConversationTitle(conversation.id, userInput, msgCount)
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

export async function startToolChat(conversationId: string | null = null) {
  try {
    console.log(
      frame(
        ` ${chalk.hex(theme.cyan).bold("supercode")} ${chalk.hex(theme.muted)("· tool mode")} `,
        { borderColor: theme.cyan }
      )
    )
    console.log()

    const user = await getUserFromToken()
    console.log()
    await selectTools()
    console.log()
    const conversation = await initToolConversation(user.id, conversationId)
    await toolChatLoop(conversation)
    resetTools()
    console.log(` ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.muted)("tools session ended")}`)
  } catch (error) {
    console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(error instanceof Error ? error.message : String(error))}`)
    resetTools()
    process.exit(1)
  }
}

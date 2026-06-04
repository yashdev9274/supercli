import chalk from "chalk"
import * as readline from "readline"
import prisma from "@super/db-terminal"
import { getStoredToken } from "src/lib/token.ts"
import { ChatService } from "src/service/chat-service.ts"
import type { ModelMessage } from "ai"
import { createProvider, type ModelProvider, type AIProvider } from "src/cli/ai/provider.ts"
export type { ModelProvider } from "src/cli/ai/provider.ts"
import {
  theme,
  frame,
  streamHeader,
  streamFooter,
  userMessage,
  compactMessageSummary,
  createThinking,
  chatHelp,
} from "src/cli/utils/tui.ts"

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

async function initConversation(userId: string, conversationId: string | null = null) {
  const thinking = createThinking("loading conversation")
  const conversation = await getChatService().getOrCreateConversation(userId, conversationId)
  thinking.succeed()

  const history = await getChatService().getMessages(conversation.id)
  if (history.length > 0) {
    console.log()
    console.log(` ${chalk.hex(theme.dim)(`${history.length} previous messages`)}`)
    history.forEach((msg, i) => {
      const displayContent = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
      compactMessageSummary(msg.role, displayContent, i + 1)
    })
    console.log()
  }

  return conversation
}

async function streamAIResponse(provider: AIProvider, conversationId: string): Promise<{ content: string; elapsed: number; usage: any }> {
  const dbMessages = await getChatService().getMessages(conversationId)
  const aiMessages = getChatService().formatMessagesForAI(dbMessages)

  let fullResponse = ""
  let isFirstChunk = true
  let firstChunkTime = 0
  const startTime = Date.now()

  const thinking = createThinking()

  try {
    const result = await provider.sendMessage(aiMessages as ModelMessage[], (chunk) => {
      if (isFirstChunk) {
        thinking.stop()
        firstChunkTime = Date.now() - startTime
        streamHeader(provider.modelName)
        isFirstChunk = false
      }
      process.stdout.write(chunk)
      fullResponse += chunk
    })

    const elapsed = Date.now() - startTime
    const usage = await result.usage

    streamFooter(usage, elapsed, provider.modelName)
    console.log()

    return { content: fullResponse, elapsed, usage }
  } catch (error) {
    thinking.fail("Response failed")
    throw error
  }
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

async function chatInput(): Promise<string | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  return new Promise((resolve) => {
    rl.on("SIGINT", () => {
      rl.close()
      resolve(null)
    })
    rl.question(chalk.hex(theme.cyan)("┃ $ "), (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

export async function chatLoop(provider: AIProvider, conversation: Conversation) {
  console.log()
  console.log(chatHelp())
  console.log()

  let messageCount = 0

  while (true) {
    const userInput = await chatInput()

    if (userInput === null) {
      console.log()
      console.log(chalk.hex(theme.amber)(` ╰─ `) + chalk.hex(theme.muted)("session ended"))
      console.log()
      process.exit(0)
    }

    const trimmed = userInput.trim()
    if (trimmed.toLowerCase() === "exit") {
      console.log()
      console.log(chalk.hex(theme.amber)(` ╰─ `) + chalk.hex(theme.muted)("session ended"))
      console.log()
      process.exit(0)
    }

    if (trimmed.length === 0) continue

    userMessage(trimmed)
    messageCount++

    await saveMessage(conversation.id, "user", trimmed)
    await updateConversationTitle(conversation.id, trimmed, messageCount)

    try {
      const result = await streamAIResponse(provider, conversation.id)
      await saveMessage(conversation.id, "assistant", result.content)
    } catch (error: any) {
      const errMsg = error?.message ?? "Unknown error"
      console.log()
      console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(errMsg)}`)
      console.log()
    }
  }
}

async function saveMessage(conversationId: string, role: string, content: string) {
  return getChatService().addMessage(conversationId, role, content)
}

export async function startChat(provider: ModelProvider = "google", model?: string, conversationId?: string | null) {
  try {
    console.clear()
    console.log()

    const aiProvider = createProvider(provider, model)

    console.log(
      frame(
        ` ${chalk.hex(theme.cyan).bold("supercode")} ${chalk.hex(theme.muted)(`ai chat · ${aiProvider.modelName}`)} `,
        { borderColor: theme.dim, padding: 0 },
      )
    )
    console.log()

    const user = await getUserFromToken()
    const conversation = await initConversation(user.id, conversationId)
    await chatLoop(aiProvider, conversation)
  } catch (error: any) {
    console.log()
    console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(error?.message ?? "Error")}`)
    console.log()
    process.exit(1)
  }
}

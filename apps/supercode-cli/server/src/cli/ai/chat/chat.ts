import chalk from "chalk"
import * as readline from "readline"
import { getStoredToken } from "src/lib/token.ts"
import {
  getCurrentUser,
  getOrCreateConversation,
  getMessages,
  addMessage,
  updateConversationMode,
  updateConversationTitle,
  formatMessagesForAI,
} from "src/lib/api-client.ts"
import type { ModelMessage } from "ai"
import { createProvider, type ModelProvider, type AIProvider } from "src/cli/ai/provider.ts"
export type { ModelProvider } from "src/cli/ai/provider.ts"
import {
  theme,
  frame,
  streamHeader,
  chatStatusBar,
  userMessage,
  compactMessageSummary,
  createThinking,
  stripAnsi,
  formatTokenCount,
} from "src/cli/utils/tui.ts"
import { getContextWindow } from "src/cli/ai/context-windows.ts"
import type { WorkspaceInfo } from "src/cli/workspace/scanner.ts"
import { buildSystemPrompt } from "src/cli/workspace/context.ts"
import { tools } from "src/tools/registry.ts"
import { renderWorkspaceBanner } from "src/cli/workspace/format.ts"

async function getUserFromToken() {
  const token = await getStoredToken()
  if (!token?.access_token) {
    console.log(chalk.hex(theme.red)("Not authenticated. Please login first."))
    process.exit(1)
  }

  const thinking = createThinking("authenticating")
  const result = await getCurrentUser()
  if (!result.ok) {
    thinking.fail("Session expired or server unreachable")
    throw new Error("Authentication failed. Run supercode login to re-authenticate.")
  }

  thinking.succeed(`Welcome, ${result.user.name}`)
  return result.user
}

export async function initConversation(userId: string, conversationId: string | null = null, mode = "chat") {
  const thinking = createThinking("loading conversation")
  const conversation = await getOrCreateConversation(conversationId, mode)
  thinking.succeed()

  const history = await getMessages(conversation.id)
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

async function streamAIResponse(
  provider: AIProvider,
  conversationId: string,
  mode: string,
  workspaceInfo?: WorkspaceInfo,
): Promise<{ content: string; elapsed: number; usage: any }> {
  const dbMessages = await getMessages(conversationId)
  let aiMessages = formatMessagesForAI(dbMessages as any)

  if (workspaceInfo) {
    process.env.SUPERCODE_WORKSPACE_ROOT = workspaceInfo.workspaceRoot
    const systemPrompt = buildSystemPrompt(workspaceInfo)
    aiMessages = [
      { role: "system", content: systemPrompt },
      ...aiMessages,
    ]
  }

  let fullResponse = ""
  let isFirstChunk = true
  let firstChunkTime = 0
  const startTime = Date.now()

  const thinking = createThinking()

  let toolsToUse: Record<string, unknown> | undefined
  if (mode === "tool" || mode === "agent") {
    toolsToUse = { ...tools }
  } else if (workspaceInfo) {
    toolsToUse = { ...tools }
  }

  try {
    const result = await provider.sendMessage(
      aiMessages as ModelMessage[],
      (chunk) => {
        if (isFirstChunk) {
          thinking.stop()
          firstChunkTime = Date.now() - startTime
          streamHeader(provider.modelName)
          isFirstChunk = false
        }
        process.stdout.write(chunk)
        fullResponse += chunk
      },
      toolsToUse,
      async ({ toolName, args }: { toolName: string; args: Record<string, unknown> }) => {
        const argPreview = (args as any)?.path || (args as any)?.pattern || (args as any)?.query || (args as any)?.url || ""
        thinking.setLabel(`${toolName}(${argPreview})`)
      },
    )

    const elapsed = Date.now() - startTime
    const usage = await result.usage
    console.log()

    return { content: fullResponse, elapsed, usage }
  } catch (error) {
    thinking.fail("Response failed")
    throw error
  }
}

async function trySetAutoTitle(conversationId: string, userInput: string, messageCount: number) {
  if (messageCount !== 1) return
  const baseTitle = userInput.slice(0, 50)
  await updateConversationTitle(conversationId, userInput.length > 50 ? `${baseTitle}...` : baseTitle)
}

interface Conversation {
  id: string
  title: string | null
  mode: string
  userId: string
  createdAt: Date
  updatedAt: Date
}

async function chatInput(
  currentMode: string,
): Promise<{ input: string | null; mode: string }> {
  return new Promise((resolve) => {
    const stdin = process.stdin
    const wasRaw = stdin.isRaw

    readline.emitKeypressEvents(stdin)
    if (stdin.isTTY) {
      stdin.setRawMode(true)
    }
    stdin.resume()

    const modes = ["chat", "tool", "agent"]
    const modeColors: Record<string, string> = {
      chat: theme.cyan,
      tool: theme.green,
      agent: theme.warning,
    }
    const modeDisplay: Record<string, string> = {
      chat: "chat",
      tool: "tools",
      agent: "agent",
    }

    let input = ""
    let cursor = 0
    let mode = modes.includes(currentMode) ? currentMode : "chat"

    function promptText(): string {
      const color = chalk.hex(modeColors[mode] ?? theme.cyan)
      return `${chalk.hex(theme.cyan)("┃ [")}${color(modeDisplay[mode] ?? mode)}${chalk.hex(theme.cyan)("] ")}`
    }

    function getPromptLen(): number {
      return stripAnsi(promptText()).length
    }

    function render() {
      readline.clearLine(process.stdout, 0)
      readline.cursorTo(process.stdout, 0)
      process.stdout.write(promptText() + input)
      const absPos = getPromptLen() + cursor
      if (absPos !== getPromptLen() + input.length) {
        readline.cursorTo(process.stdout, absPos)
      }
    }

    render()

    function cleanup() {
      stdin.removeListener("keypress", onKeypress)
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw ?? false)
      }
      stdin.pause()
    }

    function onKeypress(_str: string, key: any) {
      if (!key) return

      if (key.name === "tab") {
        const idx = modes.indexOf(mode)
        mode = modes[(idx + 1) % modes.length]!
        render()
        return
      }

      if (key.name === "return" || key.name === "enter") {
        cleanup()
        resolve({ input, mode })
        return
      }

      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        cleanup()
        resolve({ input: null, mode })
        return
      }

      if (key.name === "backspace") {
        if (cursor > 0) {
          input = input.slice(0, cursor - 1) + input.slice(cursor)
          cursor--
          render()
        }
        return
      }

      if (key.name === "delete" || key.name === "del") {
        if (cursor < input.length) {
          input = input.slice(0, cursor) + input.slice(cursor + 1)
          render()
        }
        return
      }

      if (key.name === "left") {
        if (cursor > 0) {
          cursor--
          readline.cursorTo(process.stdout, getPromptLen() + cursor)
        }
        return
      }

      if (key.name === "right") {
        if (cursor < input.length) {
          cursor++
          readline.cursorTo(process.stdout, getPromptLen() + cursor)
        }
        return
      }

      if (key.name === "home") {
        cursor = 0
        readline.cursorTo(process.stdout, getPromptLen())
        return
      }

      if (key.name === "end") {
        cursor = input.length
        readline.cursorTo(process.stdout, getPromptLen() + cursor)
        return
      }

      if (_str && _str.length === 1 && !key.ctrl && !key.meta) {
        input = input.slice(0, cursor) + _str + input.slice(cursor)
        cursor++
        readline.clearLine(process.stdout, 0)
        readline.cursorTo(process.stdout, 0)
        process.stdout.write(promptText() + input)
        readline.cursorTo(process.stdout, getPromptLen() + cursor)
        return
      }
    }

    stdin.on("keypress", onKeypress)
  })
}

export async function chatLoop(
  provider: AIProvider,
  conversation: Conversation,
  workspaceInfo?: WorkspaceInfo,
) {
  let messageCount = 0
  let sessionTokens = 0
  const contextWindow = getContextWindow(provider.modelName)

  while (true) {
    const { input: userInput, mode } = await chatInput(conversation.mode)

    if (mode !== conversation.mode) {
      conversation.mode = mode
      await updateConversationMode(conversation.id, mode)
    }

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

    await addMessage(conversation.id, "user", trimmed)
    await trySetAutoTitle(conversation.id, trimmed, messageCount)

    try {
      const result = await streamAIResponse(provider, conversation.id, conversation.mode, workspaceInfo)
      await addMessage(conversation.id, "assistant", result.content)

      const responseTokens = result.usage?.totalTokens ?? 0
      sessionTokens += responseTokens

      chatStatusBar({
        mode: conversation.mode,
        model: provider.modelName,
        usage: result.usage,
        elapsed: result.elapsed,
        cumulativeTokens: sessionTokens,
        contextWindow,
      })
      console.log()
    } catch (error: any) {
      const errMsg = error?.message ?? "Unknown error"
      console.log()
      console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(errMsg)}`)
      console.log()
    }
  }
}

export async function startChat(
  provider: ModelProvider = "google",
  model?: string,
  conversationId?: string | null,
  workspaceInfo?: WorkspaceInfo,
  initialMode = "chat",
) {
  try {
    console.clear()
    console.log()

    const aiProvider = createProvider(provider, model)

    const modeLabel = initialMode === "tool" ? "tools" : initialMode === "agent" ? "agent" : "chat"
    const subtitle = modeLabel === "chat" ? `ai chat · ${aiProvider.modelName}` : `${modeLabel} · ${aiProvider.modelName}`

    console.log(
      frame(
        ` ${chalk.hex(theme.cyan).bold("supercode")} ${chalk.hex(theme.muted)(subtitle)}`,
        { borderColor: theme.dim, padding: 0 },
      )
    )
    console.log()

    if (workspaceInfo) {
      console.log(renderWorkspaceBanner(workspaceInfo))
      console.log()
    }

    const user = await getUserFromToken()
    const conversation = await initConversation(user.id, conversationId, initialMode)
    await chatLoop(aiProvider, conversation, workspaceInfo)
  } catch (error: any) {
    console.log()
    console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(error?.message ?? "Error")}`)
    console.log()
    process.exit(1)
  }
}

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
import { handleSlashCommand, isSlashCommand } from "src/cli/commands/slashCommands/index.ts"

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
): Promise<{ content: string; elapsed: number; usage: any; aborted?: boolean }> {
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
  if (workspaceInfo) {
    toolsToUse = { ...tools }
  }

  const abortController = new AbortController()
  streamAbort = abortController

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
      abortController.signal,
    )

    const elapsed = Date.now() - startTime
    const usage = await result.usage
    console.log()

    return { content: fullResponse, elapsed, usage }
  } catch (error: any) {
    if (error?.name === "AbortError" || abortController.signal.aborted) {
      console.log()
      return { content: fullResponse || "(cancelled)", elapsed: Date.now() - startTime, usage: {}, aborted: true }
    }
    thinking.fail("Response failed")
    throw error
  } finally {
    streamAbort = null
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

// Persistent stdin state
let streamAbort: AbortController | null = null
let stdinInput = ""
let stdinCursor = 0
let stdinMode = "chat"
let stdinResolve: ((value: { input: string; mode: string }) => void) | null = null
let stdinPromptLen = 0
let stdinPrevWrapLines = 1

function promptText(): string {
  const color = chalk.hex(modeColors[stdinMode] ?? theme.cyan)
  return `${chalk.hex(theme.cyan)("┃ [")}${color(modeDisplay[stdinMode] ?? stdinMode)}${chalk.hex(theme.cyan)("] ")}`
}

function getStdoutPromptLen(): number {
  return stripAnsi(promptText()).length
}

function renderInput() {
  const cols = process.stdout.columns || 80
  const promptLen = getStdoutPromptLen()
  stdinPromptLen = promptLen
  const totalChars = promptLen + stdinInput.length
  const wrapLines = Math.max(1, Math.ceil(totalChars / cols))

  for (let i = 0; i < stdinPrevWrapLines; i++) {
    readline.cursorTo(process.stdout, 0)
    readline.clearLine(process.stdout, 0)
    if (i < stdinPrevWrapLines - 1) {
      readline.moveCursor(process.stdout, 0, -1)
    }
  }
  readline.cursorTo(process.stdout, 0)
  process.stdout.write(promptText() + stdinInput)
  stdinPrevWrapLines = wrapLines

  const absPos = promptLen + stdinCursor
  if (absPos !== promptLen + stdinInput.length) {
    readline.cursorTo(process.stdout, absPos)
  }
}

function stdinKeypress(_str: string, key: any) {
  if (!key) return

  // If streaming, Escape cancels
  if (key.name === "escape" && streamAbort) {
    streamAbort.abort()
    return
  }

  // No input handler active
  if (!stdinResolve) return

  // Tab to cycle modes
  if (key.name === "tab") {
    const idx = modes.indexOf(stdinMode)
    stdinMode = modes[(idx + 1) % modes.length]!
    renderInput()
    return
  }

  if (key.name === "return" || key.name === "enter") {
    const resolve = stdinResolve
    stdinResolve = null
    resolve({ input: stdinInput, mode: stdinMode })
    return
  }

  if (key.name === "escape") {
    stdinInput = ""
    stdinCursor = 0
    renderInput()
    return
  }

  if (key.ctrl && key.name === "c") {
    process.exit(0)
    return
  }

  if (key.name === "backspace") {
    if (stdinCursor > 0) {
      stdinInput = stdinInput.slice(0, stdinCursor - 1) + stdinInput.slice(stdinCursor)
      stdinCursor--
      renderInput()
    }
    return
  }

  if (key.name === "delete" || key.name === "del") {
    if (stdinCursor < stdinInput.length) {
      stdinInput = stdinInput.slice(0, stdinCursor) + stdinInput.slice(stdinCursor + 1)
      renderInput()
    }
    return
  }

  if (key.name === "left") {
    if (stdinCursor > 0) {
      stdinCursor--
      readline.cursorTo(process.stdout, stdinPromptLen + stdinCursor)
    }
    return
  }

  if (key.name === "right") {
    if (stdinCursor < stdinInput.length) {
      stdinCursor++
      readline.cursorTo(process.stdout, stdinPromptLen + stdinCursor)
    }
    return
  }

  if (key.name === "home") {
    stdinCursor = 0
    readline.cursorTo(process.stdout, stdinPromptLen)
    return
  }

  if (key.name === "end") {
    stdinCursor = stdinInput.length
    readline.cursorTo(process.stdout, stdinPromptLen + stdinCursor)
    return
  }

  if (_str && _str.length === 1 && !key.ctrl && !key.meta) {
    stdinInput = stdinInput.slice(0, stdinCursor) + _str + stdinInput.slice(stdinCursor)
    stdinCursor++
    readline.clearLine(process.stdout, 0)
    readline.cursorTo(process.stdout, 0)
    process.stdout.write(promptText() + stdinInput)
    readline.cursorTo(process.stdout, stdinPromptLen + stdinCursor)
    return
  }
}

function setupStdin() {
  const stdin = process.stdin
  readline.emitKeypressEvents(stdin)
  if (stdin.isTTY) {
    stdin.setRawMode(true)
  }
  stdin.resume()
  stdin.on("keypress", stdinKeypress)
}

async function chatInput(currentMode: string): Promise<{ input: string; mode: string }> {
  stdinMode = modes.includes(currentMode) ? currentMode : "chat"
  stdinInput = ""
  stdinCursor = 0
  stdinPrevWrapLines = 1
  renderInput()
  return new Promise((resolve) => {
    stdinResolve = resolve
  })
}

export async function chatLoop(
  initialProvider: AIProvider,
  conversation: Conversation,
  workspaceInfo?: WorkspaceInfo,
) {
  setupStdin()

  let messageCount = 0
  let sessionTokens = 0
  let provider = initialProvider
  let contextWindow = getContextWindow(provider.modelName)

  while (true) {
    const { input: userInput, mode } = await chatInput(conversation.mode)

    if (mode !== conversation.mode) {
      conversation.mode = mode
      await updateConversationMode(conversation.id, mode)

      if ((mode === "tool" || mode === "agent") && provider.name !== "openrouter") {
        const orProvider = createProvider("openrouter")
        provider = orProvider
        contextWindow = getContextWindow(provider.modelName)
        console.log(` ${chalk.hex(theme.blue)("◆")} switched to ${chalk.hex(theme.cyan)(provider.modelName)} for ${mode} mode`)
        console.log()
      }
    }

    const trimmed = userInput.trim()
    if (trimmed.toLowerCase() === "exit") {
      console.log()
      console.log(chalk.hex(theme.amber)(` ╰─ `) + chalk.hex(theme.muted)("session ended"))
      console.log()
      process.exit(0)
    }

    if (trimmed.length === 0) continue

    if (isSlashCommand(trimmed)) {
      const result = await handleSlashCommand(trimmed)
      if (result?.type === "model_change") {
        const newProvider = result.provider ? createProvider(result.provider, result.model) : null
        if (newProvider) {
          provider = newProvider
          contextWindow = getContextWindow(provider.modelName)
          const label = result.label || provider.modelName
          console.log(` ${chalk.hex(theme.green)("◆")} switched to ${chalk.hex(theme.cyan)(label)}`)
          console.log()
        }
      } else if (result?.type === "unknown") {
        console.log(` ${chalk.hex(theme.red)("◆")} unknown slash command: ${trimmed.split(" ")[0]}`)
        console.log()
      }
      continue
    }

    userMessage(trimmed)
    messageCount++

    await addMessage(conversation.id, "user", trimmed)
    await trySetAutoTitle(conversation.id, trimmed, messageCount)

    try {
      const result = await streamAIResponse(provider, conversation.id, conversation.mode, workspaceInfo)

      if (result.aborted) {
        if (result.content && result.content !== "(cancelled)") {
          await addMessage(conversation.id, "assistant", result.content)
        }
        console.log(` ${chalk.hex(theme.amber)("◆")} cancelled`)
        console.log()
        continue
      }

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
  provider: ModelProvider = "openrouter",
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

    const activeProvider = (initialMode === "tool" || initialMode === "agent") && provider !== "openrouter"
      ? createProvider("openrouter")
      : aiProvider

    await chatLoop(activeProvider, conversation, workspaceInfo)
  } catch (error: any) {
    console.log()
    console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(error?.message ?? "Error")}`)
    console.log()
    process.exit(1)
  }
}

/**
 * Dedicated agent-mode chat loop (build agent).
 * Shares Result/Thinking gate via runUnifiedTurn when available.
 */
import prisma from "../../../lib/prisma"
import chalk from "chalk"
import { text, confirm, isCancel } from "@clack/prompts"
import { createThinking, theme, userMessage, streamFooter } from "src/cli/utils/tui"
import { MarkdownStream } from "src/cli/utils/markdown-stream"
import { getStoredToken } from "src/lib/token"
import { ChatService } from "src/service/chat-service"
import { createProvider, type ModelProvider } from "src/cli/ai/provider"
import { runUnifiedTurn, agentIdForMode } from "src/cli/runtime/turn-runner"
import { type WorkspaceInfo } from "src/cli/workspace/scanner"
import { agentService } from "src/agents"
import { buildSystemPrompt } from "src/cli/workspace/context"
import { ThinkingDisplay, ThoughtChain } from "src/cli/ai/chat/thinking"
import { tools } from "src/agents"
import { getMcpManager } from "src/mcp/mcp-manager"

type Conversation = {
  id: string
  title: string | null
  mode: string
  userId: string
  createdAt: Date
  updatedAt: Date
}

let _chatService: ChatService | undefined

function getChatService(): ChatService {
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
  const header = ` ${chalk.hex(theme.amber)("┃")} ${chalk.hex(theme.amber).bold(conversation.title ?? "Untitled")} ${chalk.hex(theme.muted)(`· ${conversation.id.slice(0, 12)} · agent mode ──`)}`
  const desc = ` ${chalk.hex(theme.amber)("┃")} ${chalk.hex(theme.muted)("creates apps by executing commands step-by-step")}`

  console.log()
  console.log(header)
  console.log(desc)
  console.log()

  return conversation
}

async function saveMessage(conversationId: string, role: string, content: string) {
  return getChatService().addMessage(conversationId, role, content)
}

async function resolveTools(): Promise<Record<string, unknown>> {
  const toolsToUse: Record<string, unknown> = { ...tools }
  const mcpManager = getMcpManager()
  if (mcpManager.isStarted) {
    const mcpTools = await mcpManager.getAllTools()
    if (mcpTools && Object.keys(mcpTools).length > 0) {
      Object.assign(toolsToUse, mcpTools)
    }
  }
  return toolsToUse
}

async function runAgentTurn(opts: {
  model: import("ai").LanguageModel
  userInput: string
  system?: string
  toolsToUse: Record<string, unknown>
  thinking: ThinkingDisplay
  chain: ThoughtChain
}): Promise<string> {
  const { model, userInput, system, toolsToUse, thinking, chain } = opts
  const seenToolCalls = new Set<string>()
  let accumulatedText = ""

  const onTool = (toolName: string, args: unknown) => {
    const label = `${toolName}(${JSON.stringify(args ?? {})})`
    if (seenToolCalls.has(label)) return
    seenToolCalls.add(label)
    chain.begin()
    chain.addTool(toolName, JSON.stringify(args ?? {}))
    chain.finish()
    thinking.showToolCall(toolName, args)
  }

  const providerName = (process.env.SUPERCODE_AGENT_PROVIDER as string) || undefined
  try {
    const unified = await runUnifiedTurn({
      provider: (providerName as any) || "supercode",
      modelId: process.env.SUPERCODE_AGENT_MODEL || (model as any)?.modelId || "deepseek-v4-flash",
      agent: agentIdForMode("agent"),
      tools: toolsToUse as any,
      messages: [{ role: "user", content: userInput }],
      system,
      onEvent: (ev) => {
        if (ev.type === "text" && ev.delta) {
          accumulatedText += ev.delta
        } else if (ev.type === "reasoning" && ev.delta) {
          if (!chain.thoughts.length || !(chain as any).isOpen) chain.begin()
          chain.append?.(ev.delta)
        } else if (ev.type === "tool_start") {
          onTool(ev.toolName, ev.args)
        }
      },
    })
    return unified.text || accumulatedText
  } catch {
    // Fallback: direct build agent.generate when unified path lacks LanguageModel id
    const buildAgent = agentService.get("build")
    if (!buildAgent?.generate) throw new Error("build agent not available")

    const result = await buildAgent.generate({
      model,
      tools: toolsToUse,
      system,
      prompt: userInput,
      onStepFinish: async ({ text, toolCalls }: any) => {
        if (text) accumulatedText += text
        if (toolCalls?.length) {
          for (const tc of toolCalls) {
            onTool(tc.toolName, (tc as any).input)
          }
        }
      },
    })
    return result.text || accumulatedText
  }
}

async function agentLoop(
  conversation: Conversation,
  model: import("ai").LanguageModel,
  workspaceInfo?: WorkspaceInfo,
) {
  if (workspaceInfo) {
    process.env.SUPERCODE_WORKSPACE_ROOT = workspaceInfo.workspaceRoot
  }

  const agentSystemPrompt = workspaceInfo ? buildSystemPrompt(workspaceInfo, true) : undefined

  console.log(` ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.muted)("Describe an application to generate")}`)
  console.log(` ${chalk.hex(theme.muted)("•")} Type "exit" to end`)
  console.log()

  while (true) {
    const userInput = await text({
      message: chalk.hex(theme.amber)("what would you like to build?"),
      placeholder: "Describe your application...",
      validate(value: string | undefined) {
        if (!value || value.trim().length === 0) return "Description cannot be empty"
        if (value.trim().length < 10) return "Please provide more details (at least 10 characters)"
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
      const thinking = new ThinkingDisplay()
      thinking.start("thinking")
      const chain = new ThoughtChain()
      const toolsToUse = await resolveTools()

      const resultText =
        (await runAgentTurn({
          model,
          userInput,
          system: agentSystemPrompt,
          toolsToUse,
          thinking,
          chain,
        })) || "Application created successfully."

      thinking.stop()
      const elapsed = Date.now() - startTime

      if (chain.thoughts.length > 0) {
        console.log()
        chain.printUnified()
      }

      const w = process.stdout.columns ?? 80
      const dim = (s: string) => chalk.hex(theme.greenDim)(s)
      console.log(` ${chalk.hex(theme.green)("┃")} ${chalk.hex(theme.green).bold("Result")} ${dim("─".repeat(Math.max(0, w - 15)))}`)
      const md = new MarkdownStream()
      md.push(resultText)
      await md.end()
      console.log()

      await saveMessage(conversation.id, "assistant", resultText)
      streamFooter(undefined, elapsed)

      const continueApp = await confirm({
        message: chalk.hex(theme.green)("Would you like to generate another application?"),
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
        message: chalk.hex(theme.green)("Would you like to try again?"),
        initialValue: true,
      })

      if (isCancel(retry) || !retry) break
    }
  }
}

export async function startAgentChat(
  provider: ModelProvider = "supercode",
  model?: string,
  conversationId: string | null = null,
  workspaceInfo?: WorkspaceInfo,
) {
  try {
    const w = process.stdout.columns ?? 80
    const title = ` ${chalk.hex(theme.amber)("┃")} ${chalk.hex(theme.amber).bold("supercode")} ${chalk.hex(theme.muted)("· agent mode ──")}`
    const fillLen = Math.max(0, w - title.length - 1)
    console.log(`\n${title}${chalk.hex(theme.greenDim)("─".repeat(fillLen))}`)
    console.log()

    const user = await getUserFromToken()
    console.log()

    process.env.SUPERCODE_AGENT_PROVIDER = provider
    if (model) process.env.SUPERCODE_AGENT_MODEL = model
    const aiProvider = createProvider(provider, model)
    const languageModel = aiProvider.model as import("ai").LanguageModel | null

    if (!languageModel) {
      console.log(
        chalk.hex(theme.red)(
          `Agent mode requires a model with tool support. ${provider} provider does not export a compatible model.`,
        ),
      )
      process.exit(1)
    }

    const conversation = await initAgentConversation(user.id, conversationId)
    await agentLoop(conversation, languageModel, workspaceInfo)

    console.log()
    console.log(chalk.hex(theme.green)("◆") + " " + chalk.hex(theme.muted)("agent session ended"))
  } catch (error) {
    console.log(
      ` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(error instanceof Error ? error.message : String(error))}`,
    )
    process.exit(1)
  }
}

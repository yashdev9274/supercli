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
import { checkPlanGate } from "src/lib/plan-gate"
import { createThinkSplitter, finalizeAnswerVsProcess } from "src/lib/split-think-content"

/** Rough token estimate of the conversation context (chars / 4). */
function estimateContextTokens(messages: ModelMessage[]): number {
  try {
    return Math.ceil(JSON.stringify(messages).length / 4)
  } catch {
    return 0
  }
}

/** Loads the conversation transcript and estimates its token count. */
async function loadContextTokens(conversationId: string): Promise<number> {
  try {
    const msgs = await getMessages(conversationId)
    return estimateContextTokens(msgs as unknown as ModelMessage[])
  } catch {
    return 0
  }
}
import {
  permissionManager,
  setCurrentAgent,
  type PermissionPromptReply,
} from "src/tools/permission-manager.ts"
import { agentService, loadPrompt } from "src/agents/index.ts"
export type { ModelProvider } from "src/cli/ai/provider.ts"
import {
  theme,
  streamHeader,
  PersistentStatusBar,
  userMessage,
  compactMessageSummary,
  createThinking,
  stripAnsi,
  formatTokenCount,
  statusBar,
  sectionHeader,
  cardStack,
  rowCard,
  heavyDivider,
} from "src/cli/utils/tui.ts"
import { ThinkingDisplay, TurnTracker, toolLabel, ThoughtChain, extractToolArg } from "./thinking.ts"
import { StepStatusRow } from "./step-status-row.ts"
import { MarkdownStream } from "src/cli/utils/markdown-stream.ts"
import { getContextWindow } from "src/cli/ai/context-windows.ts"
import type { WorkspaceInfo } from "src/cli/workspace/scanner.ts"
import { buildSystemPrompt } from "src/cli/workspace/context.ts"
import { tools } from "src/agents/tools/registry.ts"
import { setDelegateRuntime } from "src/agents/tools/delegate.ts"
import { getMcpManager } from "src/mcp/mcp-manager"
import { CitationTracker } from "src/lib/citation-tracker.ts"
import { loadEnvOnce } from "src/lib/load-env"
import { renderWorkspaceBanner } from "src/cli/workspace/format.ts"
import { handleSlashCommand, isSlashCommand, COMMANDS } from "src/cli/commands/slashCommands/index.ts"
import {
  renderWriteSnapshot,
  renderEditSnapshot,
  renderCommandSnapshot,
  renderReadSnapshot,
  renderSearchSnapshot,
  renderGlobSnapshot,
  renderWebSearchSnapshot,
  formatBytes,
  diffLines,
  countDiff,
} from "src/cli/utils/tool-snapshot.ts"
import { renderContextBreakdown } from "src/cli/commands/slashCommands/context-window.ts"
import { saveCliConfig } from "src/lib/cli-config"
import {
  voiceCaptureFlow,
  canVoiceCapture,
  stopCapture,
  speakText,
} from "src/voice/speech.ts"
import { isJarvisWake, runJarvisStart } from "src/voice/jarvis.ts"
import path from "node:path"
import { AtPicker, DragDropTracker } from "./at-picker.ts"
import {
  indexWorkspace,
  resolveFileReferences,
} from "src/lib/file-search.ts"


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

// Store the current user for feature gating
let currentUser: { id: string; name: string | null; email: string } | null = null

// Check if the current user is Yash Dewasthale (for feature gating)
function isYashDewasthale(): boolean {
  if (!currentUser) return false
  const name = currentUser.name?.toLowerCase() ?? ""
  const email = currentUser.email?.toLowerCase() ?? ""
  return (
    name.includes("yash") && name.includes("dewasthale") ||
    email === "yashdev.yvd@gmail.com" ||
    email === "yash@supercode.ai"
  )
}

// Get user's plan tier for display
async function getUserPlanTier(): Promise<string> {
  if (!currentUser) return ""
  try {
    const prisma = (await import("src/lib/prisma")).default
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: currentUser.id,
        status: { in: ["active", "trialing"] },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    })
    if (!subscription?.plan) return ""
    return subscription.plan.tier
  } catch {
    return ""
  }
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

/**
 * Render a code/diff/stdout snapshot under the tool row for file-changing
 * tools. Mirrors OpenCode's behavior (https://github.com/anomalyco/opencode):
 *   • write_file → code block of new contents
 *   • edit_file  → unified diff of the change
 *   • run_command→ fenced stdout/stderr with exit code
 *
 * For edit_file we rebuild the diff from the args (oldText/newText) — we don't
 * need to read the file again because the args already contain the exact
 * substring that was replaced.
 *
 * Tolerant: skips rendering on any parse failure so a malformed result can
 * never break the live chat scrollback.
 *
 * Returns captured snapshot lines (with RAIL prefix) or empty array.
 */
function captureToolSnapshot(toolName: string, args: unknown, resultRaw: string): string[] {
  try {
    if (toolName === "write_file") {
      const a = (args ?? {}) as { path?: string; content?: string }
      if (typeof a.path === "string" && typeof a.content === "string") {
        const meta = `${formatBytes(a.content.length)} · written`
        return renderWriteSnapshot(a.path, a.content, meta)
      }
      return []
    }

    if (toolName === "edit_file") {
      const a = (args ?? {}) as { path?: string; oldText?: string; newText?: string }
      if (typeof a.path === "string" && typeof a.oldText === "string" && typeof a.newText === "string") {
        const diff = diffLines(a.oldText, a.newText)
        const { adds, dels } = countDiff(diff)
        const meta = `${formatBytes(a.newText.length)} · +${adds} / −${dels}`
        return renderEditSnapshot(a.path, a.oldText, a.newText, meta)
      }
      return []
    }

    if (toolName === "run_command") {
      const a = (args ?? {}) as { command?: string }
      const parsed = (() => {
        try {
          return JSON.parse(resultRaw)
        } catch {
          return null
        }
      })()
      if (parsed && typeof parsed === "object") {
        const result = (parsed as any).success === true && (parsed as any).data && typeof (parsed as any).data === "object"
          ? (parsed as any).data
          : parsed
        const stdout = typeof (result as any).stdout === "string" ? (result as any).stdout : ""
        const stderr = typeof (result as any).stderr === "string" ? (result as any).stderr : ""
        const exitCode = typeof (result as any).exitCode === "number" ? (result as any).exitCode : 0
        return renderCommandSnapshot(a.command ?? "", stdout, stderr, exitCode)
      }
      return []
    }

    if (toolName === "read_file") {
      const a = (args ?? {}) as { path?: string }
      if (typeof a.path === "string" && resultRaw.trim()) {
        // read_file returns the file content directly as a string
        return renderReadSnapshot(a.path, resultRaw)
      }
      return []
    }

    if (toolName === "search_files") {
      const a = (args ?? {}) as { pattern?: string }
      try {
        const parsed = JSON.parse(resultRaw)
        if (Array.isArray(parsed)) {
          return renderSearchSnapshot(
            a.pattern ?? "",
            parsed.map((r: any) => ({
              file: typeof r.file === "string" ? r.file : String(r.file ?? ""),
              line: typeof r.line === "number" ? r.line : 0,
              content: typeof r.content === "string" ? r.content : String(r.content ?? ""),
            })),
            parsed.length,
          )
        }
      } catch { /* best-effort */ }
      return []
    }

    if (toolName === "glob") {
      const a = (args ?? {}) as { pattern?: string }
      try {
        const parsed = JSON.parse(resultRaw)
        if (Array.isArray(parsed)) {
          return renderGlobSnapshot(a.pattern ?? "", parsed.map(String))
        }
      } catch { /* best-effort */ }
      return []
    }

    if (toolName === "web_search") {
      const a = (args ?? {}) as { query?: string }
      try {
        const parsed = JSON.parse(resultRaw)
        const results = Array.isArray(parsed) ? parsed : (parsed as any)?.results ?? []
        if (Array.isArray(results)) {
          return renderWebSearchSnapshot(
            a.query ?? "",
            results.map((r: any) => ({
              title: typeof r.title === "string" ? r.title : String(r.title ?? ""),
              url: typeof r.url === "string" ? r.url : undefined,
            })),
          )
        }
      } catch { /* best-effort */ }
      return []
    }

    if (toolName === "firecrawl_search" || toolName === "firecrawl_scrape" || toolName === "firecrawl_map") {
      const a = (args ?? {}) as { query?: string; url?: string }
      try {
        const parsed = JSON.parse(resultRaw)
        const results = Array.isArray(parsed) ? parsed : (parsed as any)?.data ?? (parsed as any)?.results ?? []
        if (Array.isArray(results)) {
          return renderWebSearchSnapshot(
            a.query ?? a.url ?? "",
            results.map((r: any) => ({
              title: typeof r.title === "string" ? r.title : typeof r.url === "string" ? r.url : String(r ?? ""),
              url: typeof r.url === "string" ? r.url : undefined,
            })),
          )
        }
      } catch { /* best-effort */ }
      return []
    }

    if (toolName === "url_fetch") {
      const a = (args ?? {}) as { url?: string }
      try {
        const parsed = JSON.parse(resultRaw)
        return renderReadSnapshot(
          a.url ?? "",
          typeof parsed === "string" ? parsed : (parsed as any)?.content ?? (parsed as any)?.markdown ?? JSON.stringify(parsed),
        )
      } catch {
        return renderReadSnapshot(a.url ?? "", resultRaw)
      }
    }
  } catch {
    // Snapshot is best-effort. Never let a render bug break the chat loop.
  }
  return []
}

async function streamAIResponse(
  provider: AIProvider,
  conversationId: string,
  mode: string,
  workspaceInfo?: WorkspaceInfo,
  statusBar?: PersistentStatusBar,
  extraContext?: string,
): Promise<{
  content: string
  elapsed: number
  usage: any
  aborted?: boolean
  modeSwitchRequested?: boolean
  modeSwitchReason?: string
}> {
  const dbMessages = await getMessages(conversationId)
  let aiMessages = formatMessagesForAI(dbMessages as any)

  if (workspaceInfo) {
    process.env.SUPERCODE_WORKSPACE_ROOT = workspaceInfo.workspaceRoot
    const hasTools = mode === "agent" || mode === "chat" || mode === "plan"
    const basePrompt = buildSystemPrompt(workspaceInfo, hasTools)

    // Resolve the agent that matches the current mode (Phase 2):
    // - "agent"  → build agent
    // - "plan"   → plan agent
    // - "chat"   → no agent prompt (chat has its own tail note)
    const agentForMode =
      mode === "agent"
        ? agentService.get("build")
        : mode === "plan"
          ? agentService.get("plan")
          : undefined

    let agentPrompt: string | undefined
    if (agentForMode?.info.prompt) {
      agentPrompt = await loadPrompt(agentForMode.info.prompt)
    }

    let promptContent = basePrompt
    if (agentPrompt) {
      promptContent += `\n\n## ${agentForMode!.info.name} agent\n\n${agentPrompt}\n`
    }

    if (mode === "chat") {
      promptContent += `\n\n## Chat Mode Note\n\nYou are in chat mode. You have access to read,\nsearch, and web tools (read_file, search_files, url_fetch, firecrawl, exa, etc.).\nRead-only shell commands (git status/log/diff, ls, cat, pwd, find, grep) and\nread-only git commands are auto-allowed without prompting.\n\nTools that modify state — write_file, edit_file, git push, git commit, git reset,\nnpm install, rm, mkdir, and any other write/delete command — require explicit\nper-user approval. If the user's task genuinely needs many such operations\nwithout interruptions, call the \`switch_to_agent_mode\` tool ONCE with a clear\nreason; the system will ask for user approval. Do NOT attempt write/exec tools\nin the same response where you call switch_to_agent_mode.\n\n## Tool Use (Mandatory)\n\nWhen the user's request is an action on their repo or workspace — review staged\nchanges, show diff, run a command, read a file, find something, check status,\nfix a file, etc. — you MUST invoke the appropriate tool (run_command,\nread_file, search_files, etc.) BEFORE you respond. Do not just describe what\nyou would do. Do not answer conversationally when the user asked you to do\nsomething. If your first response contains only reasoning or text and no tool\ncall, the system will count the turn as incomplete and the user will not see\nany action taken. Call the tool first, then summarize the result.`
    }

    if (mode === "plan") {
      promptContent += `\n\n## Plan Mode Note\n\nYou are in plan mode. You MUST NOT write files, run commands, or execute code. Produce a structured plan and stop. The user will review with /plan execute.`
    }

    // Applied to all modes — keep internal process out of the final answer body.
    // Progress/reasoning belongs in the thinking stream; the final answer is Result.
    promptContent += `\n\n## Progress Display & Final Answer\n\nSeparate your work into two surfaces:\n\n1. **Thinking / process** (reasoning stream + tool narration): short first-person progress about what you are checking, learning, or changing. Keep this concise. Do not dump long private chain-of-thought. Before tools, state the next practical step when useful.\n2. **Result** (final answer body): the polished user-facing answer only — clear headings, lists, tables, and code fences when helpful. Do not restate tool logs, spinner status, or intermediate scratch reasoning in the Result. Put the complete answer in Result after tools finish; avoid mixing process narration into the final markdown.\n\n**Hard rule:** Never put tool-planning monologue in Result (examples of FORBIDDEN Result text: "User wants web search…", "Need provide query…", "Use web_search twice…", "Must supply parameters properly in invokes…", "I'll run several web searches in one block…"). Those belong only in Thinking. If you have nothing user-facing yet because tools are still running or failed, leave Result empty rather than narrating your plan. After tools return, Result must answer the user query with findings — not how you planned the tools.`

    if (extraContext) {
      promptContent += `\n\n## Referenced Files\n\nFiles marked with @ in the user message have been read and included below. Do not re-read them with tools.\n\n${extraContext}\n`
    }

    if (loadedSkillContent) {
      promptContent += `\n\n## Loaded Skill: ${loadedSkillName || "unknown"}\n\n${loadedSkillContent}\n`
    }

    aiMessages = [
      { role: "system", content: promptContent },
      ...aiMessages,
    ]
  }

  let fullResponse = ""
  let fullReasoning = ""
  let isFirstChunk = true
  let hasOutputHeader = false
  let firstChunkTime = 0
  const startTime = Date.now()

  const thinking = new ThinkingDisplay()
  // StepStatusRow owns the live TTY status bar. ThinkingDisplay still tracks
  // the ThoughtChain + non-TTY fallback labels, but we do NOT start its
  // spinner on TTY — two spinners fighting for the same cursor row is what
  // made turns look stuck on "Thinking" while real phases never appeared.
  const statusRow = new StepStatusRow()
  const agentName = mode === "plan" ? "plan" : (mode === "chat" ? "chat" : "build")
  statusRow.start(agentName, provider.modelName, provider.connectionType)
  statusRow.setStatus("preparing turn")
  if (!process.stdout.isTTY) {
    thinking.start("preparing turn")
  }

  // Per-step live chain — we use the chain for per-step block rendering.
  // Each AI step opens a `▼ Thought: 0.0s` block, appends tool rows as tools
  // fire, then auto-collapses to `+ Thought: N.Ns` when the step finishes.
  const chain = thinking.getChain()
  activeChain = chain
  // Buffered sub-chain for delegate/task subagent tool calls. Created when a
  // delegate/task tool starts, fed by the delegate onToolCall, finalized when
  // the delegate onToolResult fires. Each sub-chain entry becomes a sub-thought
  // on the parent ThoughtEntry.
  let currentSubChain: ThoughtChain | null = null
  // Task name extracted from delegate/task args (e.g. "Find BUILTIN_CONNECTORS").
  let currentSubChainTaskName = ""
  // Publish to the module-scoped slot so the persistent footer's resize
  // handler can notify us too — StepStatusRow reserves no row of its own,
  // but its render math depends on the current terminal width.
  activeStatusRow = statusRow

  const setTurnStatus = (label: string) => {
    statusRow.setStatus(label)
    thinking.setStatus(label)
  }

  // Per-turn tool result tracker. Used to detect "all tools returned empty"
  // (the hallucination precursor) and to render empty tool calls in red.
  const turnTracker = new TurnTracker()

  // Phase 7: citation tracker — records every URL/file/search the model
  // uses so we can flag uncited factual claims in the response.
  const citationTracker = new CitationTracker()

  // Incremental markdown renderer. Buffers chunks and emits styled
  // terminal output (headings, lists, tables, code) under a Result rail.
  const md = new MarkdownStream().withResultHeader(true)
  // Defense in depth: even if a provider path leaks CoT into the text
  // channel (DeepSeek <think>, MiniMax </mm:think>, bare orphan closes),
  // peel it into the Thinking stream so Result stays user-facing only.
  const thinkSplit = createThinkSplitter()

  // Drive the persistent status bar during streaming
  let elapsedInterval: ReturnType<typeof setInterval> | undefined
  if (statusBar) {
    statusBar.resetTools()
    statusBar.update({ isStreaming: true, elapsed: 0 })
    elapsedInterval = setInterval(() => {
      statusBar.setElapsed(Date.now() - startTime)
    }, 250)
  }

  let toolsToUse: Record<string, unknown> | undefined
  let modeSwitchRequest: { requested: boolean; reason?: string } = { requested: false }

  if (workspaceInfo) {
    setTurnStatus("loading tools")
    toolsToUse = { ...tools }
    // Merge MCP tools from any connected servers (bounded — see mcp-manager timeouts)
    const mcpManager = getMcpManager()
    if (mcpManager.isStarted) {
      setTurnStatus("loading mcp tools")
      const mcpTools = await mcpManager.getAllTools()
      if (mcpTools && Object.keys(mcpTools).length > 0) {
        Object.assign(toolsToUse, mcpTools)
      }
    }
    // Ensure .env vars are loaded (Bun only auto-loads .env from CWD, which
    // may not be the server directory when launched from elsewhere).
    loadEnvOnce()

    // Determine what tools MergeDev provides. When connected, its Exa/Firecrawl
    // MCP tools already overwrote our built-in ones via Object.assign above.
    // Only delete our local Exa/Firecrawl tools if neither MergeDev nor local
    // API keys can serve them — avoids the AI calling dead tools.
    const isMergeDevConnected = mcpManager.connectedServers.includes("mergedev")
    const mergedevTools = isMergeDevConnected
      ? await mcpManager.getTools("mergedev")
      : {}
    const mcpProvided = new Set(Object.keys(mergedevTools))

    delete (toolsToUse as Record<string, unknown>).web_search

    // Determine whether Exa search is available (via local key or MergeDev)
    const hasExaSearch = !!process.env.EXA_API_KEY || mcpProvided.has("exa_search")

    // Determine whether Firecrawl search is available (via local key or MergeDev)
    const hasFirecrawlSearch = !!process.env.FIRECRAWL_API_KEY || mcpProvided.has("firecrawl_search")

    // Exa is preferred for web search. When Exa is available, remove
    // firecrawl_search to avoid redundancy — keep firecrawl_scrape and
    // firecrawl_map for URL scraping and site mapping (different use cases).
    if (hasExaSearch && hasFirecrawlSearch) {
      delete (toolsToUse as Record<string, unknown>).firecrawl_search
    }

    if (!hasFirecrawlSearch) {
      delete (toolsToUse as Record<string, unknown>).firecrawl_search
      delete (toolsToUse as Record<string, unknown>).firecrawl_scrape
      delete (toolsToUse as Record<string, unknown>).firecrawl_map
    }

    if (!hasExaSearch) {
      delete (toolsToUse as Record<string, unknown>).exa_search
      delete (toolsToUse as Record<string, unknown>).exa_fetch
    }

    // Build a prompt hint block for tool preference guidance
    const preferenceHints: string[] = []

    if (hasExaSearch) {
      preferenceHints.push(
        "For general web search, use `exa_search` — it is preferred. " +
        "Use `firecrawl_scrape` when the user asks for deep websearch or webscraping (extracting full page content, " +
        "following links, or fetching structured data from a page). " +
        "Use `firecrawl_map` to discover URLs on a site." +
        (isMergeDevConnected ? " These tools are routed through MergeDev's connectors." : "")
      )
    } else if (hasFirecrawlSearch) {
      preferenceHints.push(
        "For web search, use `firecrawl_search`. For scraping a specific URL use `firecrawl_scrape`, " +
        "and for discovering URLs on a site use `firecrawl_map`." +
        (isMergeDevConnected ? " These tools are routed through MergeDev's connectors." : "")
      )
    }

    if (Object.keys(toolsToUse).some((k) => k.startsWith("mcp_composio_"))) {
      preferenceHints.push(
        "Composio-connected MCP tools are available (prefixed with mcp_composio_). " +
        "These provide direct access to services like GitHub, Linear, Slack, etc. " +
        "When a user's request can be satisfied using these MCP tools, prefer them over running commands " +
        "via run_command or other built-in tools. For example, use mcp_composio_github_* tools for GitHub " +
        "operations instead of running gh CLI commands."
      )
    }

    if (preferenceHints.length > 0 && aiMessages[0]) {
      aiMessages[0].content += `\n\n## Tool Preference\n\n${preferenceHints.join("\n\n")}`
    }

    // Wire the subagent runtime so the `delegate` tool can spawn focused subtasks.
    setDelegateRuntime({
      model: (provider as any).model ?? null,
      allTools: toolsToUse,
      onChunk: (chunk) => {
        if (chunk == null) return
        // Think-split first so <|thinking|> tags aren't eaten by tool-XML strip.
        const split = thinkSplit.push(String(chunk))
        if (split.reasoning) {
          fullReasoning += split.reasoning
          if (!chain.isOpen) chain.beginAndPrint()
          chain.append(split.reasoning)
          thinking.showReasoning(split.reasoning)
        }
        const filtered = split.text ? stripToolCallXml(split.text) : ""
        if (!filtered) return
        if (isFirstChunk && !hasOutputHeader) {
          emitHeader()
          isFirstChunk = false
        }
        md.push(filtered)
        fullResponse += filtered
      },
      onToolCall: ({ toolName, args }) => {
        if (!hasOutputHeader) emitHeader()
        // Route subagent tool calls to the buffered sub-chain so they're
        // stored as subThoughts for post-hoc Ctrl+X toggling.
        if (currentSubChain) {
          if (!currentSubChain.isOpen) {
            currentSubChain.beginAndPrint()
          }
          currentSubChain.printToolRow(toolName, args)
        }
        // Sub-agent tool calls are tracked internally in the sub-chain
        // for Ctrl+X toggle — no live printing to keep the terminal clean.
        statusRow.setCurrentTool(toolName, args)
        verbosePrint(toolName, args, provider.modelName, Date.now())
        if (statusBar) statusBar.incTools()
      },
    })
  }

  pendingModeSwitch: { requested: false }

  function emitHeader() {
    if (hasOutputHeader) return
    hasOutputHeader = true
    thinking.markHeaderEmitted()
    thinking.stop()
    // Stop the status row before any streaming output hits stdout, so its
    // 100ms render() ticks don't keep clearing the streaming output line.
    statusRow.stop()
    streamHeader(provider.modelName)
  }

  const abortController = new AbortController()
  streamAbort = abortController

  function cleanupStreamingTicker() {
    if (elapsedInterval) {
      clearInterval(elapsedInterval)
      elapsedInterval = undefined
    }
  }

  try {
    setTurnStatus(
      provider.connectionType === "proxy"
        ? "sending via cloud · waiting for first token"
        : "sending request · waiting for first token",
    )
    const result = await provider.sendMessage(
      aiMessages as ModelMessage[],
      (chunk) => {
        if (chunk == null) return
        // Peel embedded CoT / think tags out of the text channel FIRST so
        // Result only gets the user-facing answer (Thinking gets process).
        // Must run before stripToolCallXml — that path also drops <|…|> tokens
        // and would otherwise leave CoT body in Result without its tags.
        const split = thinkSplit.push(String(chunk))
        if (split.reasoning) {
          fullReasoning += split.reasoning
          if (!chain.isOpen) chain.beginAndPrint()
          chain.append(split.reasoning)
          thinking.showReasoning(split.reasoning)
          if (!hasOutputHeader) setTurnStatus("model reasoning")
        }
        // Filter raw tool call XML markup from the visible answer only.
        const filtered = split.text ? stripToolCallXml(split.text) : ""
        if (!filtered) return
        if (isFirstChunk && !hasOutputHeader) {
          emitHeader()
          isFirstChunk = false
          statusRow.setStreaming()
        }
        md.push(filtered)
        fullResponse += filtered
      },
      toolsToUse,
      async ({ toolName, args }: { toolName: string; args?: unknown }) => {
        if (!hasOutputHeader) emitHeader()
        thinking.showToolCall(toolName, args)
        // Open a fresh block only on the first tool call of a step;
        // consecutive calls append to the same open block.
        if (!chain.isOpen) {
          chain.beginAndPrint()
        }
        chain.printToolRow(toolName, args)
        // When the main agent calls delegate/task, create a buffered sub-chain
        // so subagent tool calls are captured as a nested "Explore Task" section.
        // The first entry is created lazily when the first subagent tool fires.
        if (toolName === "delegate" || toolName === "task") {
          currentSubChain = new ThoughtChain(true)
          let extracted = extractToolArg(toolName, args)
          if (!extracted && args && typeof args === "object") {
            const a = args as Record<string, unknown>
            const items = a.items
            if (Array.isArray(items) && items.length > 0 && typeof items[0] === "object" && items[0] !== null) {
              const first = items[0] as Record<string, unknown>
              if (typeof first.task === "string") extracted = first.task.slice(0, 60)
            }
          }
          if (extracted) {
            currentSubChainTaskName = extracted
          }
        }
        statusRow.setCurrentTool(toolName, args)
        verbosePrint(toolName, args, provider.modelName, Date.now())
        // Mirror tool count to the status bar so users see "X tools" climb live.
        if (statusBar) statusBar.incTools()
      },
      abortController.signal,
(reasoningChunk) => {
        // Server status heartbeats arrive as `[status] …` via onReasoning so
        // the live bar can show connecting / plan-gate / upstream without
        // waiting for first model token.
        if (typeof reasoningChunk === "string" && reasoningChunk.startsWith("[status] ")) {
          const label = reasoningChunk.slice("[status] ".length).trim() || "cloud working"
          if (!hasOutputHeader) setTurnStatus(label)
          return
        }
        fullReasoning += reasoningChunk
        // Keep process text on the thought chain (Thinking dropdown), never
        // push it into the Result markdown stream.
        if (!chain.isOpen) {
          chain.beginAndPrint()
        }
        chain.append(reasoningChunk)
        thinking.showReasoning(reasoningChunk)
        // Surface that the model is actually reasoning — not stuck idle.
        if (!hasOutputHeader) {
          setTurnStatus("model reasoning")
        }
      },
      async ({ toolName, args, result, stepNumber }: { toolName: string; args?: unknown; result: unknown; stepNumber?: number }) => {
        // Capture tool result for the post-turn warning + tracker.
        const entry = turnTracker.recordCall(toolName, args, result as string)

        // Phase 7: record the source as a citation if it's a research tool.
        citationTracker.recordFromToolCall(toolName, args)

        // Empty/denied → mark the live Thought block's last tool row so the
        // expanded view shows a red ✗ and finishAndPrint keeps the block open.
        if (entry.empty || entry.permissionDenied) {
          chain.markLastToolFlagged()
        }

        // Capture a snapshot/diff under the tool row for file-changing tools
        // and store it on the last tool in the current thought entry. The
        // snapshot is rendered only when the thought block is expanded.
        if (!entry.empty && !entry.permissionDenied && process.stdout.isTTY) {
          const snap = captureToolSnapshot(toolName, args, result as string)
          if (snap.length > 0) {
            const lastTool = chain.current?.tools?.[chain.current.tools.length - 1]
            if (lastTool) lastTool.snapshot = snap
          }
        }

        // Finalize the buffered sub-chain for delegate/task. Only keep
        // entries that have at least one tool call — empty entries from the
        // initial begin() are discarded.
        if (currentSubChain && (toolName === "delegate" || toolName === "task")) {
          currentSubChain.finish()
          // Print a collapsed "Explore Task" summary for the sub-agent
          if (process.stdout.isTTY) {
            const rail = chalk.hex(theme.greenDim)("┃")
            const subIndent = `${rail}   ${rail}`
            const elapsed = currentSubChain.elapsed
            const elapsedStr =
              elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`
            const hadFailures = currentSubChain.thoughts.some(
              (t) => t.tools.some((tt) => tt.flagged),
            )
            const toggle = hadFailures
              ? chalk.hex(theme.greenGlow)("+")
              : chalk.hex("#5ec27e")("✓")
            const taskDesc = currentSubChainTaskName
              ? ` ${chalk.hex(theme.greenDim)("—")} ${chalk.hex(theme.white)(currentSubChainTaskName)}`
              : ""
            process.stdout.write(
              `${subIndent} ${toggle} ${chalk.hex(theme.greenMute)("Explore Task")}${taskDesc} ${chalk.hex(theme.greenDim)("·")} ${elapsedStr}\n`,
            )
            const toolCount = currentSubChain.thoughts.reduce(
              (n, t) => n + t.tools.length, 0,
            )
            if (toolCount > 0) {
              process.stdout.write(
                `${subIndent}   ${chalk.hex(theme.greenDim)("↳")} ${chalk.hex(theme.greenMute)(`${toolCount} toolcall${toolCount === 1 ? "" : "s"} · ${elapsedStr}`)}\n`,
              )
            }
          }
          const lastEntry = chain.thoughts[chain.thoughts.length - 1]
          if (lastEntry) {
            const nonEmpty = currentSubChain.thoughts.filter(
              (t) => t.tools.length > 0 || t.body.trim().length > 0,
            )
            if (nonEmpty.length > 0) {
              for (const entry of nonEmpty) {
                entry.taskName = currentSubChainTaskName
              }
              lastEntry.subThoughts.push(...nonEmpty)
            }
          }
          currentSubChain = null
          currentSubChainTaskName = ""
        }

        // Detect a mode-switch request (Phase 2: clean function-call return
        // instead of the old `pendingModeSwitch` module global). The tool
        // returns `{ modeSwitchRequested: true, reason }` as a JSON string.
        if (toolName === "switch_to_agent_mode") {
          try {
            const parsed =
              typeof result === "string" ? JSON.parse(result) : (result as any)
            if (parsed?.modeSwitchRequested) {
              modeSwitchRequest = {
                requested: true,
                reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
              }
            }
          } catch {
            // non-JSON result; ignore
          }
        }
      },
      // Per-step finish: close the live Thought block and update the
      // status row. This is the OpenCode-style render: each step writes
      // its expanded tool list then auto-collapses to "+ Thought: N.Ns".
      ({ stepNumber }) => {
        chain.finishAndPrint({ autoCollapse: true })
        statusRow.setPhase("thinking")
        setTurnStatus("waiting for next model step")
        const step = stepNumber ?? chain.thoughts.length
        statusRow.setStepCount(step)
        thinking.setStepCount(step)
      },
      // Step budget notification: tells the status row and thinking
      // display the max steps so they can render "step 3/8".
      (maxSteps) => {
        statusRow.setMaxSteps(maxSteps)
        thinking.setMaxSteps(maxSteps)
      },
    )

    const elapsed = Date.now() - startTime
    const usage = await result.usage
    // Only stop the thinking display if we never emitted the header —
    // emitHeader() already called thinking.stop() when streaming began.
    // Calling it again here after streaming output has been written to
    // stdout would clear the current cursor line, erasing the response.
    if (!hasOutputHeader) thinking.stop()
    cleanupStreamingTicker()

    // Make sure any in-progress step is closed cleanly. Normally onStepFinish
    // has already fired for each step, but the last step's finishAndPrint
    // could have raced with the text-delta stream — close defensively.
    if (chain.thoughts.length > 0) {
      const last = chain.thoughts[chain.thoughts.length - 1]!
      if (last.endTime === null) {
        chain.finishAndPrint({ autoCollapse: true })
      }
    }

    // Each step already rendered itself in-context during streaming via
    // chain.printToolRow + chain.finishAndPrint. No need for the legacy
    // end-of-turn dump.
    statusRow.stop()
    activeStatusRow = null
    activeChain = null

    // If pure reasoning arrived with no tools/text steps closed yet, fold it
    // into the Thinking block so process never leaks into Result.
    if (fullReasoning.trim().length > 0 && chain.thoughts.length > 0) {
      const last = chain.thoughts[chain.thoughts.length - 1]!
      if (!last.body.trim()) {
        last.body = fullReasoning.trim()
      } else if (!last.body.includes(fullReasoning.trim().slice(0, 40))) {
        last.body = `${last.body.trim()}\n${fullReasoning.trim()}`
      }
      if (last.endTime === null) {
        chain.finishAndPrint({ autoCollapse: true })
      }
    } else if (fullReasoning.trim().length > 0 && chain.thoughts.length === 0) {
      chain.begin()
      chain.append(fullReasoning.trim())
      chain.finishAndPrint({ autoCollapse: true })
    }

    // Flush any partial think-tag held across the last chunk boundary.
    {
      const tail = thinkSplit.flush()
      if (tail.reasoning) {
        fullReasoning += tail.reasoning
        if (!chain.isOpen) chain.beginAndPrint()
        chain.append(tail.reasoning)
        thinking.showReasoning(tail.reasoning)
      }
      if (tail.text) {
        md.push(tail.text)
        fullResponse += tail.text
      }
    }

    // Final gate for ALL providers/models: peel untagged process monologue
    // ("Need provide query… Use web_search twice…") out of Result even when
    // no <think> tags were present. Applies after streaming so every path
    // (proxy, concentrate, openrouter, google, minimax, …) is covered.
    {
      const cleaned = finalizeAnswerVsProcess(fullResponse, fullReasoning)
      if (cleaned.reasoning && cleaned.reasoning !== fullReasoning.trim()) {
        const extra = cleaned.reasoning.startsWith(fullReasoning.trim())
          ? cleaned.reasoning.slice(fullReasoning.trim().length).trim()
          : cleaned.reasoning
        if (extra) {
          fullReasoning = cleaned.reasoning
          // Rebuild / fold into Thinking so process isn't lost.
          if (chain.thoughts.length === 0) {
            chain.begin()
            chain.append(extra)
            chain.finishAndPrint({ autoCollapse: true })
          } else {
            const last = chain.thoughts[chain.thoughts.length - 1]!
            if (!last.body.includes(extra.slice(0, Math.min(40, extra.length)))) {
              last.body = `${last.body.trim()}\n${extra}`.trim()
            }
          }
        }
      }
      fullResponse = cleaned.text
      // Replace the markdown buffer so Result never prints process scratch.
      md.reset()
      if (fullResponse.trim()) {
        md.push(fullResponse)
        md.setFallback(fullResponse)
      }
    }

    // Flush final answer markdown under the Result rail only.
    if (fullResponse.trim().length > 0) {
      md.setFallback(fullResponse)
    }
    if (md.hasContent) {
      console.log()
      await md.end()
      console.log()
    }

    // If tools ran but the model produced no analysis text, show a minimal
    // marker so the turn doesn't end with a dangling thought block.
    if (turnTracker.hasAnyToolCalls() && fullResponse.trim().length === 0) {
      const w = process.stdout.columns ?? 80
      const dim = (s: string) => chalk.hex(theme.greenDim)(s)
      console.log(` ${chalk.hex(theme.green)("┃")} ${chalk.hex(theme.green).bold("Result")} ${dim("─".repeat(Math.max(0, w - 15)))}`)
      console.log(` ${chalk.hex(theme.green)("┃")} ${chalk.hex(theme.muted)("Tools completed — no analysis text returned.")}`)
    }

    // Update the persistent status bar with final turn state
    if (statusBar) {
      const totalTokens = usage?.totalTokens ?? 0
      if (totalTokens > 0) statusBar.addTokens(totalTokens)
      statusBar.update({ isStreaming: false, elapsed: 0 })
    }

    // End-of-turn warning: if every tool result was empty/error, surface that
    // loudly so the user knows the answer may be unreliable. Catches the case
    // where the model invented an answer despite the sentinel injection.
    //
    // Two distinct cases worth surfacing differently:
    //   (a) "all denied" — user said no to every tool. This is a normal
    //       interaction, NOT a hallucination. Show as amber info, not red.
    //   (b) "all empty"  — at least one tool succeeded but returned empty
    //       content, OR a tool returned success:false without being denied.
    //       This is the hallucination precursor. Show as red.
    if (turnTracker.allResultsEmpty() && turnTracker.hasAnyToolCalls()) {
      const calls = turnTracker.allCalls()
      const allDenied = calls.every((c) => c.permissionDenied)
      const empty = turnTracker.emptyCount()
      const total = turnTracker.totalCount()
      const summary = calls
        .map((c) => {
          const reason = c.error ?? "empty result"
          return `${c.name}: ${reason}`
        })
        .join(" · ")

      console.log()
      if (allDenied) {
        console.log(
          ` ${chalk.hex(theme.amber)("⚠")}  ${chalk.hex(theme.amber).bold(`${total}/${total} tool call${total === 1 ? "" : "s"} denied by user`)} ${chalk.hex(theme.muted)(`— ${summary}`)}`,
        )
        console.log(
          `   ${chalk.hex(theme.muted)("The model's answer reflects your denials, not a failed retrieval. Approve or retry.")}`,
        )
      } else {
        console.log(
          ` ${chalk.hex(theme.red)("⚠")}  ${chalk.hex(theme.red).bold(`${empty}/${total} tool calls returned no content`)} ${chalk.hex(theme.redMute)(`— ${summary}`)}`,
        )
        console.log(
          `   ${chalk.hex(theme.amber)("If the answer above cites facts, they were not retrieved from any tool. Treat with skepticism.")}`,
        )
      }
    }

    // Hallucination guard: if the response claims a concrete action (wrote,
    // updated, added, created, ran, executed, fixed, refactored, …) but
    // the model made ZERO tool calls, it's narrating without acting.
    if (!turnTracker.hasAnyToolCalls() && fullResponse.length > 0) {
      const actionClaimRe = /\b(wrote|updated|added|created|ran|executed|fixed|refactored|removed|deleted|installed|modified|edited|applied|saved|generated|wired|hooked)\b/i
      if (actionClaimRe.test(fullResponse)) {
        console.log()
        console.log(
          ` ${chalk.hex(theme.red)("⚠")}  ${chalk.hex(theme.red).bold("no tool calls — model's response claims an action but made no changes")}`,
        )
        console.log(
          `   ${chalk.hex(theme.amber)("The text above is a description, not the result. Ask the model to actually invoke the tool.")}`,
        )
      }
    }

    // Phase 7: citation-check warning — flag uncited URLs/file paths in
    // the response so the user can investigate.
    const suspects = citationTracker.suspectClaims(fullResponse)
    if (suspects.length > 0) {
      console.log()
      console.log(
        ` ${chalk.hex(theme.amber)("⚠")}  ${chalk.hex(theme.amber).bold(`${suspects.length} uncited claim${suspects.length === 1 ? "" : "s"}`)}`,
      )
      for (const s of suspects.slice(0, 5)) {
        console.log(
          `   ${chalk.hex(theme.amber)("·")} ${chalk.hex(theme.muted)(s)}`,
        )
      }
      if (suspects.length > 5) {
        console.log(
          `   ${chalk.hex(theme.muted)(`…and ${suspects.length - 5} more`)}`,
        )
      }
    }

    // Turn footer with elapsed time
    const elapsedStr =
      elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`
    const footerText = ` Worked for ${elapsedStr} `
    const footerWidth = Math.max(0, (process.stdout.columns ?? 80) - stripAnsi(footerText).length - 2)
    const leftFill = Math.floor(footerWidth / 2)
    const rightFill = footerWidth - leftFill
    console.log(
      chalk.hex(theme.greenDim)(
        `${"─".repeat(leftFill)}${footerText}${"─".repeat(rightFill)}`,
      ),
    )
    console.log()
    return {
      content: fullResponse,
      elapsed,
      usage,
      modeSwitchRequested: modeSwitchRequest.requested,
      modeSwitchReason: modeSwitchRequest.reason,
    }
  } catch (error: any) {
    cleanupStreamingTicker()
    if (error?.name === "AbortError" || abortController.signal.aborted) {
      thinking.stop()
      // Close any in-progress per-step block so the live chat log stays clean.
      if (chain && chain.thoughts.length > 0) {
        const last = chain.thoughts[chain.thoughts.length - 1]!
        if (last.endTime === null) {
          chain.finishAndPrint({ autoCollapse: true })
        }
      }
      statusRow.stop()
      activeStatusRow = null
      if (fullResponse.trim().length > 0) md.setFallback(fullResponse)
      await md.end()
      if (statusBar) statusBar.update({ isStreaming: false, elapsed: 0 })
      console.log()
      return {
        content: fullResponse || "(cancelled)",
        elapsed: Date.now() - startTime,
        usage: {},
        aborted: true,
      }
    }
    thinking.stop()
    statusRow.stop()
    activeStatusRow = null
    activeChain = null
    if (fullResponse.trim().length > 0) md.setFallback(fullResponse)
    await md.end()
    if (statusBar) statusBar.update({ isStreaming: false, elapsed: 0 })
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

const modes = ["chat", "plan", "agent"]
const modeColors: Record<string, string> = {
  chat: theme.green,
  plan: theme.greenDim,
  agent: theme.amber,
}
const modeDisplay: Record<string, string> = {
  chat: "chat",
  plan: "plan",
  agent: "agent",
}

/**
 * Map a chat-loop mode to its agent name (or undefined for chat).
 * Drives `setCurrentAgent` so the permission manager scopes its
 * ruleset correctly when the chat loop is the top-level caller.
 */
function agentForMode(mode: string): string | undefined {
  if (mode === "agent") return "build"
  if (mode === "plan") return "plan"
  return undefined
}

/**
 * Apply both pieces of permission state for a given mode:
 *   - sessionLevel: "allow" for agent mode, null otherwise
 *   - currentAgent: "build" for agent mode, "plan" for plan mode,
 *     undefined for chat mode (so DEFAULT rules apply)
 *
 * Call this whenever the mode changes (Tab, /plan, /plan execute, etc.).
 */
function applyModePermissions(mode: string): void {
  permissionManager.setSessionLevel(mode === "agent" ? "allow" : null)
  setCurrentAgent(agentForMode(mode))
}

// Persistent stdin state
let streamAbort: AbortController | null = null
// The currently-streaming ThoughtChain (or null between turns). Exposed at
// module scope so the stdin keypress handler can hit Ctrl+T without
// threading the chain through every helper.
let activeChain: { thoughts: { endTime: number | null; subThoughts: { collapsed: boolean }[] }[]; togglePrinted: (i: number) => void; reprintThought: (i: number) => void } | null = null
let stdinInput = ""
let stdinCursor = 0
let stdinMode = "chat"
let stdinResolve: ((value: { input: string; mode: string }) => void) | null = null
let stdinPromptLen = 0
let stdinPrevWrapLines = 1

// Set by the voice capture flow so the next chatInput() preserves the
// transcribed text instead of wiping stdinInput to "".
let voiceJustCaptured = false

// Set when a voice capture auto-submits (Clicky-style) so the loop can speak
// the reply back once the assistant turn finishes. Consumed at most once.
let voiceAutoSubmitted = false

// Loaded skill context — injected as a system message so the AI uses it
// without pasting the full text into the user's input.
export let loadedSkillName: string | undefined
let loadedSkillContent: string | undefined
let skillJustLoaded = false

export function clearSkill() {
  loadedSkillName = undefined
  loadedSkillContent = undefined
  skillJustLoaded = false
}

// When true, prints the legacy ─ toolName · model · N.Ns · esc interrupt
// debug lines on top of the new per-step UI. Used by /verbose for power users
// debugging supercode's TUI itself. Default off because the new live
// Thought blocks + StepStatusRow already convey the same info in context.
let verboseMode = false

// Emit one legacy debug line per tool call when verbose mode is on. Reuses
// the same `─ toolName model · N.Ns · esc interrupt` shape as the cmd2.png
// repro so people debugging supercode's TUI get the same output they used to.
function verbosePrint(toolName: string, args: unknown, modelName: string, startMs: number) {
  if (!verboseMode) return
  if (!process.stdout.isTTY) return
  const elapsedMs = Date.now() - startMs
  const elapsedStr = elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`
  const label = toolLabel(toolName, args)
  const modelStr = chalk.hex(theme.greenGlow)(modelName)
  const elapsedColor = chalk.hex(theme.greenMute)(elapsedStr)
  const dash = chalk.hex(theme.greenDim)("─")
  process.stdout.write(
    `${dash} ${label} ${chalk.hex(theme.greenDim)("·")} ${modelStr} ${chalk.hex(theme.greenDim)("·")} ${elapsedColor} ${chalk.hex(theme.greenDim)("· esc interrupt")}\n`,
  )
}

//
// Active permission prompt state. When `permissionPromptActive` is non-null,
// the keypress handler is hijacked: every y/a/n/Escape routes into the
// permission reply instead of the chat-input line. This is how the chat
// loop and the permission manager cooperate on a single raw-mode stdin.
//
type PermissionPromptSession = {
  isDangerous: boolean
  onReply: (reply: PermissionPromptReply) => void
  /** Snapshot of the previous input state so we can restore on cancel. */
  savedInput: string
  savedCursor: number
}

let permissionPromptActive: PermissionPromptSession | null = null
let activeFooter: PersistentStatusBar | null = null
// The currently-streaming StepStatusRow, if any. The resize handler below
// reads this and forwards the new width so the live status row tracks the
// terminal even mid-turn.
let activeStatusRow: StepStatusRow | null = null

let slashListLines = 0
let slashSelected = -1
let atListLines = 0
let ddListLines = 0
const atPicker = new AtPicker()
const ddTracker = new DragDropTracker()

function renderChatHeader(modelName: string, mode: string): void {
  const modeLabel = mode === "agent" ? "agent" : "chat"
  const subtitle = modeLabel === "chat" ? `ai chat · ${modelName}` : `agent · ${modelName}`
  const w = process.stdout.columns ?? 80
  const title = chalk.hex(theme.green).bold("SUPERCODE")
  const tagline = chalk.hex(theme.greenDim)(`${subtitle}`)
  const headerText = `${title}  ${tagline}`
  const headerLen = stripAnsi(headerText).length
  console.log(" ".repeat(Math.max(0, Math.floor((w - headerLen) / 2))) + headerText)
  console.log()
  console.log(
    statusBar({
      left: ["supercode", modeLabel, modelName],
      right: ["ready", "type to chat"],
    }),
  )
  console.log()
}

// Filter the slash-command list by what the user has typed. Empty query
// returns everything. Match is case-insensitive substring on the command
// name (e.g. "/co" → /connect, /compact, /context).
function filterSlashCommands(query: string): typeof COMMANDS {
  const q = query.toLowerCase()
  if (!q) return COMMANDS
  return COMMANDS.filter((c) => c.cmd.toLowerCase().includes(q))
}

// Whether a voice capture is in progress (blocks the keypress handler)
let voiceCaptureActive = false

// Message history (up/down arrow navigation)
let messageHistory: string[] = []
let historyIndex = -1
let savedDraft = ""

function promptText(): string {
  const color = chalk.hex(modeColors[stdinMode] ?? theme.green)
  const caret = chalk.hex(theme.amber)("▌")
  return `${caret} ${chalk.hex(theme.green)("[")}${color(modeDisplay[stdinMode] ?? stdinMode)}${chalk.hex(theme.green)("]")} ${chalk.hex(theme.greenGlow)(">")} `
}

function getStdoutPromptLen(): number {
  return stripAnsi(promptText()).length
}

function renderInput() {
  const cols = process.stdout.columns || 80
  const promptLen = getStdoutPromptLen()
  stdinPromptLen = promptLen
  const visibleLen = stdinInput.length || 'Ask anything... "Fix broken tests"'.length
  const totalChars = promptLen + visibleLen
  const wrapLines = Math.max(1, Math.ceil(totalChars / cols))

  // Clear old list + overlays + input from bottom to top
  const totalPrev =
    stdinPrevWrapLines + slashListLines + atListLines + ddListLines
  // Move cursor down past all overlay content
  for (let i = 0; i < slashListLines + atListLines + ddListLines; i++) {
    readline.moveCursor(process.stdout, 0, 1)
  }
  // Now clear from bottom to top
  for (let i = 0; i < totalPrev; i++) {
    readline.cursorTo(process.stdout, 0)
    readline.clearLine(process.stdout, 0)
    if (i < totalPrev - 1) {
      readline.moveCursor(process.stdout, 0, -1)
    }
  }

  // Write prompt + input (with placeholder when empty)
  readline.cursorTo(process.stdout, 0)
  const inputText = stdinInput || chalk.hex(theme.greenDim)('Ask anything... "Fix broken tests"')
  process.stdout.write(promptText() + inputText)
  stdinPrevWrapLines = wrapLines

  // Show slash autocomplete list with scrolling window (mirrors AtPicker
  // pattern — max 10 visible, selection-centered, scroll indicators).
  slashListLines = 0
  if (stdinInput.startsWith("/") && stdinInput.length >= 1) {
    const filtered = filterSlashCommands(stdinInput)
    if (filtered.length > 0) {
      if (slashSelected >= filtered.length) slashSelected = -1

      const maxVisible = 10
      const total = filtered.length
      const half = Math.floor(maxVisible / 2)

      let start = Math.max(0, slashSelected === -1 ? 0 : slashSelected - half)
      let end = Math.min(total, start + maxVisible)
      if (end - start < maxVisible && start > 0) {
        start = Math.max(0, end - maxVisible)
      }

      const hasPrev = start > 0
      const hasNext = end < total

      const lines: string[] = []

      const divider = heavyDivider()
      lines.push(divider)

      if (slashSelected === -1) {
        lines.push(` ${chalk.hex(theme.amber)("❯")} ${stdinInput}`)
      }

      lines.push(divider)

      if (hasPrev) {
        lines.push(` ${chalk.hex(theme.greenDim)(`▲ ${start} more`)}`)
      }

      for (let i = start; i < end; i++) {
        const c = filtered[i]!
        if (slashSelected === i) {
          const bg = chalk.bgHex(theme.greenDeep)
          const padded = ` ${chalk.hex(theme.amber)("▸")} ${chalk.hex(theme.green).bold(c.cmd.padEnd(22))}${chalk.hex(theme.white)(c.desc)}`
          lines.push(bg(padded.padEnd(process.stdout.columns ?? 80)))
        } else {
          lines.push(` ${chalk.hex(theme.muted)(" ")} ${chalk.hex(theme.green)(c.cmd.padEnd(22))}${chalk.hex(theme.muted)(c.desc)}`)
        }
      }

      if (hasNext) {
        lines.push(` ${chalk.hex(theme.greenDim)(`▼ ${total - end} more`)}`)
      }

      lines.push(divider)

      for (const line of lines) {
        process.stdout.write(`\r\n${line}`)
      }

      slashListLines = lines.length

      for (let i = 0; i < slashListLines; i++) {
        readline.moveCursor(process.stdout, 0, -1)
      }
    }
  }

  // ── @ file/agent picker overlay ──
  atListLines = 0
  if (atPicker.visible && atPicker.items.length > 0) {
    const cols = process.stdout.columns || 80
    const lines = atPicker.render(cols)
    for (const line of lines) {
      process.stdout.write("\r\n" + line)
    }
    atListLines = lines.length
  }

  // ── Drag-drop file indicator ──
  ddListLines = 0
  const ddLines = ddTracker.render(process.stdout.columns || 80)
  if (ddLines.length > 0) {
    for (const line of ddLines) {
      process.stdout.write("\r\n" + line)
    }
    ddListLines = ddLines.length
  }

  // Park cursor back up past the overlays
  const totalOverlay = atListLines + ddListLines
  for (let i = 0; i < totalOverlay; i++) {
    readline.moveCursor(process.stdout, 0, -1)
  }

  readline.cursorTo(process.stdout, promptLen + stdinCursor)
}

function stdinKeypress(_str: string, key: any) {
  if (!key) return

  // If streaming, Escape cancels
  if (key.name === "escape" && streamAbort) {
    streamAbort.abort()
    return
  }

  // ─── Permission-prompt hijack ────────────────────────────────────────────
  //
  // While a permission prompt is active, the keypress handler is owned by
  // the permission manager — NOT by the chat input line. We consume the
  // key, route y/a/n/Escape into the prompt reply, and *return early*
  // before any of the chat-input logic below can run. This is what fixes
  // the bug where the default readline-based prompt raced with this
  // handler and the user's keystrokes were silently dropped.
  //
  if (permissionPromptActive) {
    const session = permissionPromptActive
    const reply = keyToPermissionReply(key, session.isDangerous)
    if (reply) {
      permissionPromptActive = null
      clearPermissionPromptLine()
      session.onReply(reply)
    }
    return
  }

  // No input handler active
  if (!stdinResolve) return

  // Tab to cycle modes
  if (key.name === "tab") {
    const idx = modes.indexOf(stdinMode)
    stdinMode = modes[(idx + 1) % modes.length]!
    applyModePermissions(stdinMode)
    if (activeFooter) activeFooter.setMode(stdinMode)
    renderInput()
    return
  }

  // ── @ file/agent picker ──
  if (atPicker.visible) {
    if (key.name === "up" || (key.name === "p" && key.ctrl)) {
      atPicker.selectPrev()
      renderInput()
      return
    }
    if (key.name === "down" || (key.name === "n" && key.ctrl)) {
      atPicker.selectNext()
      renderInput()
      return
    }
    if (key.name === "return" || key.name === "enter") {
      const selected = atPicker.getSelected()
      if (selected) {
        const insertText = `@${atPicker.getRelativePath(selected.path)}`
        const atPos = stdinInput.lastIndexOf("@", stdinCursor)
        if (atPos >= 0) {
          stdinInput =
            stdinInput.slice(0, atPos) +
            insertText +
            stdinInput.slice(stdinCursor)
          stdinCursor = atPos + insertText.length
        }
      }
      atPicker.close()
      renderInput()
      return
    }
    if (key.name === "escape") {
      atPicker.close()
      renderInput()
      return
    }
  }

  // Enter/Escape during voice capture stops recording, doesn't submit
  if (voiceCaptureActive && (key.name === "return" || key.name === "enter" || key.name === "escape")) {
    stopCapture()
    return
  }

  if (key.name === "return" || key.name === "enter") {
    // If a slash command is selected, insert it so the user can type arguments
    const filtered = filterSlashCommands(stdinInput)
    if (slashSelected >= 0 && slashSelected < filtered.length) {
      const cmd = filtered[slashSelected]!.cmd
      slashSelected = -1
      // Clear list
      for (let i = 0; i < stdinPrevWrapLines + slashListLines; i++) {
        readline.moveCursor(process.stdout, 0, 1)
      }
      for (let i = 0; i < stdinPrevWrapLines + slashListLines; i++) {
        readline.cursorTo(process.stdout, 0)
        readline.clearLine(process.stdout, 0)
        if (i < stdinPrevWrapLines + slashListLines - 1) {
          readline.moveCursor(process.stdout, 0, -1)
        }
      }
      slashListLines = 0
      stdinInput = cmd + " "
      stdinCursor = stdinInput.length
      renderInput()
      return
    }

    commitInput()
    return
  }

  if (key.name === "escape") {
    slashSelected = -1
    stdinInput = ""
    stdinCursor = 0
    renderInput()
    return
  }

  if (key.ctrl && key.name === "c") {
    process.exit(0)
    return
  }

  // Ctrl+T — toggle the most recently printed Thought block (collapsed ↔ expanded).
  // Cheap in-place redraw: clear the line at the current cursor, rewrite the
  // chevron + body in the new state, then move the cursor back down. Only
  // works on a TTY because the rendered Thought blocks live in ANSI scrollback.
  if (key.ctrl && key.name === "t" && process.stdout.isTTY && activeChain) {
    const thoughts = activeChain.thoughts
    if (thoughts.length > 0) {
      const last = thoughts[thoughts.length - 1]!
      if (last.endTime !== null) {
        activeChain.togglePrinted(thoughts.length - 1)
      }
    }
    return
  }

  // Ctrl+X — toggle the most recent sub-thought (Explore) on the last thought
  // entry. Allows drill-down into subagent activity without expanding the main
  // thought chain.
  if (key.ctrl && key.name === "x" && process.stdout.isTTY && activeChain) {
    const lastThought = activeChain.thoughts[activeChain.thoughts.length - 1]
    if (lastThought && lastThought.endTime !== null && lastThought.subThoughts.length > 0) {
      const lastSub = lastThought.subThoughts[lastThought.subThoughts.length - 1]
      if (lastSub) {
        lastSub.collapsed = !lastSub.collapsed
        activeChain.reprintThought(activeChain.thoughts.length - 1)
      }
    }
    return
  }

  if (key.name === "backspace") {
    if (key.meta) {
      const before = stdinInput.slice(0, stdinCursor)
      const after = stdinInput.slice(stdinCursor)
      const match = before.match(/\s*\S+\s*$/)
      if (match) {
        const wordLen = match[0].length
        stdinInput = before.slice(0, before.length - wordLen) + after
        stdinCursor -= wordLen
        slashSelected = -1
        historyIndex = -1
        renderInput()
      }
    } else if (stdinCursor > 0) {
      stdinInput = stdinInput.slice(0, stdinCursor - 1) + stdinInput.slice(stdinCursor)
      stdinCursor--
      slashSelected = -1
      historyIndex = -1
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

  if (key.name === "up") {
    if (slashListLines > 0) {
      const filteredLen = filterSlashCommands(stdinInput).length
      if (filteredLen === 0) return
      if (slashSelected === -1) {
        slashSelected = filteredLen - 1
      } else {
        slashSelected = (slashSelected - 1 + filteredLen) % filteredLen
      }
      renderInput()
    } else if (messageHistory.length > 0) {
      if (historyIndex === -1) {
        savedDraft = stdinInput
        historyIndex = messageHistory.length - 1
      } else if (historyIndex > 0) {
        historyIndex--
      }
      stdinInput = messageHistory[historyIndex] ?? ""
      stdinCursor = stdinInput.length
      renderInput()
    }
    return
  }

  if (key.name === "down") {
    if (slashListLines > 0) {
      const filteredLen = filterSlashCommands(stdinInput).length
      if (filteredLen === 0) return
      if (slashSelected === -1) {
        slashSelected = 0
      } else {
        slashSelected = (slashSelected + 1) % filteredLen
      }
      renderInput()
    } else if (historyIndex !== -1) {
      if (historyIndex < messageHistory.length - 1) {
        historyIndex++
        stdinInput = messageHistory[historyIndex] ?? ""
      } else {
        historyIndex = -1
        stdinInput = savedDraft
        savedDraft = ""
      }
      stdinCursor = stdinInput.length
      renderInput()
    }
    return
  }

  if (key.name === "left") {
    if (key.meta) {
      // Option+Left: jump to start of previous word
      const before = stdinInput.slice(0, stdinCursor)
      const start = before.trimEnd().lastIndexOf(" ") + 1
      stdinCursor = Math.max(0, start || 0)
      readline.cursorTo(process.stdout, stdinPromptLen + stdinCursor)
    } else if (stdinCursor > 0) {
      stdinCursor--
      readline.cursorTo(process.stdout, stdinPromptLen + stdinCursor)
    }
    return
  }

  if (key.name === "right") {
    if (key.meta) {
      // Option+Right: jump to start of next word
      const after = stdinInput.slice(stdinCursor)
      const firstNonWs = after.search(/\S/)
      if (firstNonWs !== -1) {
        stdinCursor += firstNonWs
      } else {
        stdinCursor = stdinInput.length
      }
      readline.cursorTo(process.stdout, stdinPromptLen + stdinCursor)
    } else if (stdinCursor < stdinInput.length) {
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

  // Voice capture — Ctrl+V is the primary trigger (bottom-left corner of most
  // keyboards, reliably detected in any terminal). F2 is also accepted as a
  // fallback. Note: Shift is intentionally omitted — terminals fold Shift into
  // Ctrl+letter combos, so Ctrl+Shift+V sends the same byte as Ctrl+V.
  const isVoiceKey =
    (key.ctrl && (key.name === "v" || key.name === "V")) ||
    key.name === "f2"
  if (isVoiceKey) {
    if (!voiceCaptureActive) {
      startVoiceCapture().finally(() => {
        voiceCaptureActive = false
      })
    } else {
      stopCapture()
    }
    return
  }

  // ─── Character insertion ───────────────────────────────────────────
  if (_str && _str.length === 1 && !key.ctrl && !key.meta) {
    activeFooter?.setStatusMessage("")
    stdinInput =
      stdinInput.slice(0, stdinCursor) + _str + stdinInput.slice(stdinCursor)
    stdinCursor++
    slashSelected = -1
    historyIndex = -1

    // @ trigger detection
    const textBeforeCursor = stdinInput.slice(0, stdinCursor)
    const atMatch = textBeforeCursor.match(/@(\S*)$/)
    if (atMatch) {
      atPicker.open(atMatch[1] ?? "")
    } else if (atPicker.visible) {
      atPicker.close()
    }

    // Drag-drop path detection
    ddTracker.checkDragDrop(stdinInput)

    renderInput()
    return
  }
}

async function startVoiceCapture() {
  if (!isYashDewasthale()) {
    activeFooter?.setStatusMessage("⛭ Voice features are only available for Yash Dewasthale")
    setTimeout(() => activeFooter?.setStatusMessage(""), 4000)
    return
  }
  const check = canVoiceCapture()
  if (!check.ok) {
    const reason = check.reason ?? "unknown"
    activeFooter?.setStatusMessage("⛭ Voice unavailable: " + reason)
    setTimeout(() => activeFooter?.setStatusMessage(""), 4000)
    return
  }
  const prevMode = voiceCaptureActive
  voiceCaptureActive = true
  activeFooter?.setStatusMessage("🎤 Recording... (voice key or Enter to stop)")
  try {
    const text = await voiceCaptureFlow()
    if (text) {
      if (isJarvisWake(text)) {
        // Wake-word caught — don't submit an agent turn, just start the
        // workspace, speak a confirmation, and print the open summary.
        const opened = await runJarvisAndSpeak()
        process.stdout.write(
          `\r\n ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.amber)("Jarvis")} woke — opening: ${opened.join(", ") || "none configured"}\r\n\n`,
        )
        if (stdinResolve) renderInput()
        else voiceJustCaptured = true
        return
      }
      stdinInput =
        stdinInput.slice(0, stdinCursor) + text + " " + stdinInput.slice(stdinCursor)
      stdinCursor += text.length + 1
      slashSelected = -1
      historyIndex = -1
      if (stdinResolve) {
        // Loop is idle awaiting input — Clicky-style: auto-submit the spoken
        // command so the agent actually does the thing and speaks back.
        voiceAutoSubmitted = true
        commitInput()
      } else {
        // Agent is busy — just fill the input so the user can review/send later.
        voiceJustCaptured = true
      }
    } else {
      activeFooter?.setStatusMessage("🎤 No speech detected — press voice key to retry")
      setTimeout(() => activeFooter?.setStatusMessage(""), 4000)
      // Nothing was submitted — restore the input prompt in place.
      if (stdinResolve) renderInput()
    }
  } catch (err) {
    activeFooter?.setStatusMessage("⛭ Voice failed: " + (err instanceof Error ? err.message : err))
    setTimeout(() => activeFooter?.setStatusMessage(""), 4000)
    if (stdinResolve) renderInput()
  } finally {
    voiceCaptureActive = prevMode
  }
}

// Wake Jarvis: launch the configured workspace targets in the default browser,
// speak a short confirmation, and report the status line for text. Returns the
// names that opened successfully.
async function runJarvisAndSpeak(): Promise<string[]> {
  if (!isYashDewasthale()) {
    return []
  }
  const { opened } = runJarvisStart()
  const reply = opened.length
    ? `Jarvis online. Opening ${opened.slice(0, 3).join(", ")}${opened.length > 3 ? " and more" : ""}.`
    : "Jarvis online, but no workspace apps are configured."
  activeFooter?.setStatusMessage(`🤖 Jarvis online · ${opened.length} app${opened.length === 1 ? "" : "s"} opening`)
  setTimeout(() => activeFooter?.setStatusMessage(""), 6000)
  await speakText(reply)
  return opened
}

// Commit whatever stdinInput currently holds as a submitted chat turn. Shared
// by the Enter key and the Clicky-style voice auto-execute path so both clear
// the input overlays (slash list, @ picker, drag-drop) and resolve the
// pending chatInput() promise identically.
function commitInput(): void {
  const resolve = stdinResolve
  if (!resolve) return
  stdinResolve = null
  // Clear slash list (content below input line)
  for (let i = 0; i < slashListLines; i++) {
    readline.moveCursor(process.stdout, 0, 1)
  }
  for (let i = 0; i < slashListLines; i++) {
    readline.cursorTo(process.stdout, 0)
    readline.clearLine(process.stdout, 0)
    if (i < slashListLines - 1) {
      readline.moveCursor(process.stdout, 0, -1)
    }
  }
  slashListLines = 0
  // Clear @ picker overlay
  atPicker.close()
  for (let i = 0; i < atListLines; i++) {
    readline.moveCursor(process.stdout, 0, 1)
  }
  for (let i = 0; i < atListLines; i++) {
    readline.cursorTo(process.stdout, 0)
    readline.clearLine(process.stdout, 0)
    if (i < atListLines - 1) {
      readline.moveCursor(process.stdout, 0, -1)
    }
  }
  atListLines = 0
  // Clear drag-drop indicator
  for (let i = 0; i < ddListLines; i++) {
    readline.moveCursor(process.stdout, 0, 1)
  }
  for (let i = 0; i < ddListLines; i++) {
    readline.cursorTo(process.stdout, 0)
    readline.clearLine(process.stdout, 0)
    if (i < ddListLines - 1) {
      readline.moveCursor(process.stdout, 0, -1)
    }
  }
  ddListLines = 0
  ddTracker.clear()
  process.stdout.write("\r\n")
  resolve({ input: stdinInput, mode: stdinMode })
}

function ensureStdinHandler() {
  const stdin = process.stdin
  readline.emitKeypressEvents(stdin)
  if (stdin.isTTY) {
    try { stdin.setRawMode(true) } catch {}
  }
  stdin.resume()
  const hasHandler = stdin.listeners("keypress").includes(stdinKeypress)
  if (!hasHandler) {
    stdin.on("keypress", stdinKeypress)
  }
}

function setupStdin() {
  ensureStdinHandler()
}

// ─── Permission prompt: chat-loop-native driver ────────────────────────────
//
// `setPermissionPrompt` is called once on chat startup. It registers a
// prompt function on the global `permissionManager` that:
//   1. Renders the same boxen UI the old default did (so the look is
//      unchanged).
//   2. Stores an active-prompt session in `permissionPromptActive`,
//      which `stdinKeypress` checks at the top of every keystroke.
//   3. Resolves when the user types y/a/n (or Escape for cancel).
//
// Crucially, this runs WITHOUT spawning a new `readline.createInterface`.
// It reuses the same raw-mode stdin that the chat input loop already
// drives, so there are no competing listeners.

function setPermissionPrompt(): void {
  permissionManager.setPromptFunction(async (req) => {
    return new Promise<PermissionPromptReply>((resolve) => {
      renderPermissionPrompt(req)
      permissionPromptActive = {
        isDangerous: req.isDangerous,
        savedInput: stdinInput,
        savedCursor: stdinCursor,
        onReply: (reply) => {
          // Restore the chat input line that was on screen behind the
          // prompt. Re-render it from scratch so the cursor lands correctly.
          stdinInput = permissionPromptActive?.savedInput ?? stdinInput
          stdinCursor = permissionPromptActive?.savedCursor ?? stdinCursor
          try {
            renderInput()
          } catch {
            // Terminal may be in a transient bad state — keep going.
          }
          resolve(reply)
        },
      }
    })
  })
}

/**
 * Render the permission box for an incoming request. Pure side-effect:
 * writes the boxen frame + the answer hint to stdout.
 */
function renderPermissionPrompt(req: {
  toolName: string
  resource: string
  args: Record<string, unknown>
  isDangerous: boolean
}): void {
  // Push below whatever the AI last wrote (thought section, streaming
  // output, etc.) so the box appears at a clean position.
  process.stdout.write("\r\n")

  const borderColor = req.isDangerous ? theme.red : theme.amber
  const header = req.isDangerous ? " DANGEROUS OPERATION " : " Permission Request "

  let content = ""
  if (req.toolName === "write_file") {
    content = `Supercode wants to write:\n  ${chalk.cyan(req.resource)}`
    if (req.args.description) {
      content += `\n  ${chalk.dim(String(req.args.description))}`
    }
  } else if (req.toolName === "run_command") {
    content = `Run:\n  $ ${chalk.cyan(req.resource)}`
    if (req.args.description) {
      content += `\n  ${chalk.dim(String(req.args.description))}`
    }
  } else if (req.toolName === "code_exec") {
    const preview =
      req.resource.length > 80 ? req.resource.slice(0, 77) + "..." : req.resource
    content = `Execute code:\n  ${chalk.cyan(preview)}`
  }

  if (req.isDangerous) {
    content += `\n\n${chalk.red("This operation is potentially destructive.")}`
  }

  // boxen is a CommonJS default import — grab it from the same module path
  // used by permission-manager.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const boxen = require("boxen").default ?? require("boxen")
  const box = boxen(content, {
    title: header,
    borderColor,
    padding: 1,
    margin: 1,
  })
  process.stdout.write(box + "\n")

  const hint = req.isDangerous
    ? chalk.hex(theme.amber)("Allow? (y/N) ")
    : chalk.hex(theme.green)("[y] once  [a] always for session  [n] deny  ")

  process.stdout.write(hint)
}

/**
 * Erase the prompt lines we just wrote so the chat input re-renders
 * cleanly on top of them.
 */
function clearPermissionPromptLine(): void {
  // The box + hint occupies roughly 8 lines (boxen 1px border + padding
  // + content). Move cursor up past them and clear.
  for (let i = 0; i < 9; i++) {
    readline.moveCursor(process.stdout, 0, -1)
    readline.cursorTo(process.stdout, 0)
    readline.clearLine(process.stdout, 0)
  }
}

/**
 * Translate a raw keypress into a permission reply, or undefined to
 * ignore (so the user can still hit modifier-only keys etc. without
 * accidentally denying).
 */
function keyToPermissionReply(
  key: any,
  isDangerous: boolean,
): PermissionPromptReply | undefined {
  // y or enter → once
  if (key.name === "y" || key.name === "Y") return "once"
  if (key.name === "return" || key.name === "enter") return "once"
  // a → always (only when safe — dangerous commands can't be made "always")
  if (!isDangerous && (key.name === "a" || key.name === "A")) return "always"
  // n, Escape, Ctrl-C → reject
  if (key.name === "n" || key.name === "N") return "reject"
  if (key.name === "escape") return "reject"
  if (key.ctrl && key.name === "c") return "reject"
  return undefined
}

// Strip raw tool call XML that some providers (notably Kimi and certain
// Anthropic-compatible proxies) leak into the text stream alongside
// structured tool calls. The pattern looks like:
//   <|tool_calls_section_begin|><|tool_call_begin|>functions.<name>:<id><|tool_call_argument_begin|>...
// When a chunk contains any <|tool_|> markers, treat the ENTIRE chunk as
// tool call markup and drop it — real user-facing text is never mixed with
// raw tool call XML.
function stripToolCallXml(chunk: string): string {
  if (!chunk) return ""
  // MiniMax control tokens + Kimi/tool XML leak into the text stream.
  // Drop them so the TUI never shows raw markup like `]<]minimax[>[<tool_call>`.
  let out = chunk
  if (
    out.includes("<|") ||
    out.includes("<tool_") ||
    out.includes("<invoke") ||
    /\binvoke\s+name\s*=/.test(out) ||
    out.includes("]<]") ||
    out.includes("[<tool_call") ||
    out.includes("/tool_call>") ||
    /\{\s*"(?:tool|name)"\s*:/.test(out)
  ) {
    out = out
      .replace(/\]\s*<\s*\]\s*minimax\s*\[\s*>\s*(?:\[\s*<\s*tool_call\s*>)?/gi, "")
      .replace(/\[\s*<\s*tool_call\s*>/gi, "")
      .replace(/<\|\s*[^|>]+\s*\|>/g, "")
      .replace(/<\/?tool_call[^>]*>/gi, "")
      // Drop MiniMax <invoke> blocks (both <parameter> and <command>/<description> shapes).
      .replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, "")
      .replace(/\binvoke\s+name\s*=\s*(?:"[^"]+"|'[^']+'|[^\s>]+)[\s\S]*?(?:<\/invoke>|\/invoke>)/gi, "")
      .replace(/<\/?invoke\b[^>]*>/gi, "")
      .replace(/<\/?(?:command|description|parameter|arguments?)\b[^>]*>/gi, "")
      .replace(/\/(?:tool_call|invoke)\s*>/gi, "")
      // Drop bare MiniMax-style tool descriptors that slipped past the proxy.
      .replace(/\{\s*"(?:tool|name)"\s*:\s*"[^"]+"[\s\S]*?\}/g, "")
  }
  // If the entire chunk is (or contains) a tool call section block, drop it.
  // This handles the Kimi K2-6 pattern:
  //   <|tool_calls_section_begin|><|tool_call_begin|>functions.read_file:0<|tool_call_argument_begin|>...
  if (/<\|tool_calls_section_begin\|>/.test(chunk)) return ""
  const stripped = out.replace(/<function>[^<]*<\/function>/g, "").trim()
  if (!stripped) return ""
  return stripped
}

async function chatInput(currentMode: string): Promise<{ input: string; mode: string }> {
  stdinMode = modes.includes(currentMode) ? currentMode : "chat"
  applyModePermissions(stdinMode)
  // If voice capture or skill load just populated stdinInput, preserve it.
  // Otherwise reset to empty as usual.
  if (skillJustLoaded) {
    skillJustLoaded = false
    // keep stdinInput as-is, just re-render
  } else if (!voiceJustCaptured) {
    stdinInput = ""
    stdinCursor = 0
  } else {
    voiceJustCaptured = false
  }
  stdinPrevWrapLines = 1
  slashListLines = 0
  ensureStdinHandler()
  try {
    renderInput()
  } catch {
    // Terminal state may be corrupted after tool output; reset gracefully
  }
  return new Promise((resolve) => {
    stdinResolve = resolve
  })
}

export async function chatLoop(
  initialProvider: AIProvider,
  conversation: Conversation,
  workspaceInfo?: WorkspaceInfo,
) {
  const exitHandler = (code: number) => {
    try {
      if (code === 0) {
        // Drop the persistent footer before printing the goodbye line.
        if (activeFooter) activeFooter.unmount()
        process.stdout.write("\r\n")
        process.stdout.write(
          `  ${chalk.hex(theme.green)("◇")}  ${chalk.hex(theme.white).bold("thanks for being here")}  ${chalk.hex(theme.green)("◇")}\r\n`,
        )
        process.stdout.write(
          `     ${chalk.hex(theme.greenMute)("see you next time · supercode ◆")}\r\n`,
        )
      }
    } catch {}
  }
  process.on("exit", exitHandler)

  setupStdin()

  // Register a chat-loop-native permission prompt that uses the existing
  // keypress handler. Without this, the default readline-based prompt in
  // permission-manager.ts races with the chat loop's stdin keypress
  // listener (both fight for stdin in raw mode and the readline question
  // never receives a complete line). See setPermissionPrompt below.
  setPermissionPrompt()

  if (workspaceInfo?.workspaceRoot) {
    process.env.SUPERCODE_WORKSPACE_ROOT = workspaceInfo.workspaceRoot
    atPicker.setWorkspaceRoot(workspaceInfo.workspaceRoot)
    ddTracker.setRoot(workspaceInfo.workspaceRoot)
    await indexWorkspace(workspaceInfo.workspaceRoot)
  }

  let messageCount = 0
  let sessionTokens = 0
  let provider = initialProvider
  let contextWindow = getContextWindow(provider.modelName)
  let sessionStartTime = Date.now()
  let lastUsage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined = undefined
  let lastElapsed: number | undefined = undefined

  // Auto-compaction threshold: if accumulated tokens exceed 75% of context window,
  // automatically run compaction to avoid hitting the limit mid-conversation.
  const COMPACT_THRESHOLD = 0.75

  async function maybeCompactConversation(id: string) {
    const total = sessionTokens + (lastUsage?.totalTokens ?? 0)
    if (total < contextWindow * COMPACT_THRESHOLD) return
    if (contextWindow <= 0) return
    process.stdout.write(
      ` ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.muted)(`token usage at ${Math.round((total / contextWindow) * 100)}% — auto-compacting`)}\r\n`,
    )
    try {
      const { compactCommand } = await import("src/cli/commands/slashCommands/compact.ts")
      await compactCommand({
        provider,
        conversationId: id,
        getMessages: async (cid) => {
          const msgs = await getMessages(cid)
          return msgs.map((m: any) => ({
            role: typeof m.role === "string" ? m.role : "user",
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          }))
        },
        saveSummary: async (cid, summary) => {
          await addMessage(cid, "system", `[compaction] ${summary}`)
        },
      })
      sessionTokens = 0 // reset after compaction
      process.stdout.write(` ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.muted)("compaction complete")}\r\n`)
    } catch {
      // Non-fatal — compact is best-effort
    }
  }

  // Persistent footer bar (matches OpenCode's always-there status line).
  // The bar reserves the row immediately below the prompt so it stays anchored
  // through every keystroke, every tool call, and every response.
  const footer = new PersistentStatusBar()
  activeFooter = footer
  footer.setMode(conversation.mode)
  footer.setModel(provider.modelName)
  footer.setContextWindow(contextWindow)
  footer.setTokens(0)
  // Set plan tier in footer
  const planTier = await getUserPlanTier()
  if (planTier) footer.setPlan(planTier)
  footer.mount()

  // Re-mount on terminal resize so the status row tracks the new bottom row.
  const resizeHandler = () => {
    if (activeFooter) {
      activeFooter.unmount()
      activeFooter.mount()
    }
    if (activeStatusRow) {
      activeStatusRow.resize(process.stdout.columns ?? 80)
    }
  }
  process.stdout.on("resize", resizeHandler)

  while (true) {
    try {
      const { input: userInput, mode } = await chatInput(conversation.mode)

      if (mode !== conversation.mode) {
        conversation.mode = mode
        await updateConversationMode(conversation.id, mode)
      }

      const trimmed = userInput.trim()
      // If the user wrapped their entire input in matched single or double
      // quotes (e.g. `'https://example.com'` or `"what is X"`), strip the
      // outer pair. This prevents the quotes from being passed verbatim to
      // tool calls like url_fetch.
      const unquoted =
        (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) ||
        (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
          ? trimmed.slice(1, -1)
          : trimmed
      if (unquoted.toLowerCase() === "exit") {
        process.stdout.write("\r\n")
        process.exit(0)
      }

      if (unquoted.length === 0) continue

      // Track non-slash messages in history. Use the unquoted form so message
      // history reflects the user's actual intent (no stray quote chars).
      if (!isSlashCommand(trimmed)) {
        messageHistory.push(unquoted)
        if (messageHistory.length > 100) messageHistory.shift()
      }
      historyIndex = -1
      savedDraft = ""

      if (isSlashCommand(trimmed)) {
        if (process.stdin.isTTY) process.stdin.setRawMode(false)
        const result = await handleSlashCommand(trimmed)
        stdinInput = ""
        stdinCursor = 0
        stdinPrevWrapLines = 1
        if (process.stdin.isTTY) process.stdin.setRawMode(true)
        ensureStdinHandler()
        if (result?.type === "exit") {
          process.stdout.write("\r\n")
          process.exit(0)
        }
        if (result?.type === "model_change") {
          const newProvider = result.provider ? createProvider(result.provider, result.model) : null
          if (newProvider) {
            provider = newProvider
            contextWindow = getContextWindow(provider.modelName)
            const label = result.label || provider.modelName
  footer.setModel(provider.modelName)
  footer.setConnectionType(provider.connectionType)
            footer.setContextWindow(contextWindow)
            process.stdout.write(`\r\n ${chalk.hex(theme.green)("◆")} switched to ${chalk.hex(theme.green)(label)}\r\n\n`)
            saveCliConfig({ provider: result.provider!, model: result.model || provider.modelName, mode: conversation.mode as "chat" | "agent" })
          }
        } else if (result?.type === "connect") {
          if (result.provider) {
            const modelToUse = result.model || provider.modelName
            const newProvider = createProvider(result.provider, modelToUse)
            if (newProvider) {
              provider = newProvider
              contextWindow = getContextWindow(provider.modelName)
              footer.setModel(provider.modelName)
              footer.setConnectionType(provider.connectionType)
              footer.setContextWindow(contextWindow)
              const label = `${provider.name} · ${provider.modelName}`
              process.stdout.write(`\r\n ${chalk.hex(theme.green)("◆")} switched to ${chalk.hex(theme.green)(label)}\r\n`)
              saveCliConfig({ provider: result.provider!, model: modelToUse, mode: conversation.mode as "chat" | "agent" })
            }
          }
          process.stdout.write(`\r\n`)
        } else if (result?.type === "context") {
          renderContextBreakdown({
            modelName: provider.modelName,
            contextWindow,
            sessionTokens,
            messageCount,
            lastUsage,
            lastElapsed,
            sessionStartTime,
            mode: conversation.mode,
          })
          process.stdout.write(`\r\n`)
        } else if (result?.type === "compact") {
          const { compactCommand } = await import("src/cli/commands/slashCommands/compact.ts")
          await compactCommand({
            provider,
            conversationId: conversation.id,
            getMessages: async (id) => {
              const msgs = await getMessages(id)
              return msgs.map((m: any) => ({
                role: typeof m.role === "string" ? m.role : "user",
                content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
              }))
            },
            saveSummary: async (id, summary) => {
              // Phase 4: replace the older half of the conversation with a
              // single summary message. Full implementation will rewrite the
              // message table; for now we annotate the first user message
              // with a marker that the next /context will show.
              await addMessage(id, "system", `[compaction] ${summary}`)
            },
          })
          process.stdout.write(`\r\n`)
        } else if (result?.type === "plan") {
          // The plan handler distinguishes "switch into plan mode" (label
          // undefined) from "/plan execute" (label: "execute").
          if (result.label === "execute") {
            const { readScratch, latestScratch } = await import(
              "src/lib/scratch.ts"
            )
            const plan = await latestScratch("plan-")
            if (!plan) {
              process.stdout.write(
                `\r\n ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)("no plan found. run /plan first.")}\r\n\n`,
              )
            } else {
              const body = await readScratch(plan.name)
              if (body) {
                // Switch to agent mode for the execution and inject the plan
                // as the next user message.
                conversation.mode = "agent"
                await updateConversationMode(conversation.id, "agent")
                footer.setMode("agent")
                applyModePermissions("agent")
                process.stdout.write(
                  `\r\n ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.amber)(`executing plan: ${plan.name}`)}\r\n\n`,
                )
                userMessage(`Execute this plan:\n\n${body}`)
                await addMessage(conversation.id, "user", `Execute this plan:\n\n${body}`)
                messageCount++
                continue // skip the normal user-prompt path
              }
            }
          } else {
            // Plain /plan — switch mode for the next turn.
            conversation.mode = "plan"
            await updateConversationMode(conversation.id, "plan")
            footer.setMode("plan")
            process.stdout.write(
              `\r\n ${chalk.hex(theme.amber)("◆")} plan mode — read-only. next response will be a plan.\r\n\n`,
            )
          }
        } else if (result?.type === "scratch") {
          process.stdout.write(`\r\n`)
        } else if (result?.type === "voice") {
          await startVoiceCapture()
          // Mark stdinInput as voice-populated so the next chatInput() doesn't
          // wipe it. renderInput was already invoked inside startVoiceCapture
          // (via setImmediate) so the text should already be visible.
          voiceJustCaptured = true
          process.stdout.write(`\r\n`)
        } else if (result?.type === "jarvis") {
          if (!isYashDewasthale()) {
            process.stdout.write(
              `\r\n ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)("Jarvis is only available for Yash Dewasthale")}\r\n\n`,
            )
          } else {
            const opened = await runJarvisAndSpeak()
            process.stdout.write(
              `\r\n ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.amber)("Jarvis")} woke — opening: ${opened.join(", ") || "none configured"}\r\n\n`,
            )
          }
        } else if (result?.type === "skills") {
          if (result.skillName && result.message) {
            loadedSkillName = result.skillName
            loadedSkillContent = result.message

            if (result.trigger) {
              // /{name} directly — send trigger message to AI
              const triggerMsg = `[skill: ${result.skillName}]`
              userMessage(triggerMsg)
              messageCount++
              await addMessage(conversation.id, "user", triggerMsg)
              try {
                const totalTokens = await loadContextTokens(conversation.id)
                const gate = await checkPlanGate(conversation.userId, provider.modelName, { totalTokens })
                if (!gate.allowed) {
                  process.stdout.write(`\r\n ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.amber)(gate.message)}\r\n\n`)
                } else {
                  const aiResult = await streamAIResponse(provider, conversation.id, conversation.mode, workspaceInfo, footer)
                  if (aiResult.aborted) {
                    process.stdout.write(` ${chalk.hex(theme.muted)("response aborted")}\r\n\n`)
                  }
                }
              } catch (err: any) {
                const msg = err.message || String(err)
                process.stdout.write(`\r\n ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(msg)}\r\n\n`)
              } finally {
                clearSkill()
              }
              footer.renderLine()
            } else {
              // Selected from picker — set /{name} tag and let user type
              process.stdout.write(
                `\r\n ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.greenGlow).bold(result.skillName)} ${chalk.hex(theme.muted)("loaded — type your message and press Enter")}\r\n\n`,
              )
              stdinInput = `/${result.skillName} `
              skillJustLoaded = true
            }
          }
        } else if (result?.type === "verbose") {
          verboseMode = !verboseMode
          process.stdout.write(
            `\r\n ${chalk.hex(theme.green)("◆")} verbose mode ${verboseMode ? chalk.hex(theme.green)("on") : chalk.hex(theme.greenDim)("off")} — ${verboseMode ? "per-tool debug lines enabled" : "clean UI"}\r\n\n`,
          )
        } else if (result?.type === "clear") {
          messageCount = 0
          sessionTokens = 0
          sessionStartTime = Date.now()
          lastUsage = undefined
          lastElapsed = undefined
          footer.unmount()
          console.clear()
          console.log()
          renderChatHeader(provider.modelName, conversation.mode)
          if (workspaceInfo) {
            console.log(renderWorkspaceBanner(workspaceInfo))
            console.log()
          }
          console.log(
            `  ${chalk.hex(theme.greenDim)("hint")} ${chalk.hex(theme.green)("·")} ${chalk.hex(theme.greenGlow)("/model")} to switch  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("Ctrl+V")} voice  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("/help")} for commands  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("Tab")} to cycle mode`,
          )
          console.log()
          footer.mount()
          footer.setTokens(0)
          process.stdout.write(
            ` ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.green)("session content cleared")}\r\n`,
          )
        } else if (result?.type === "new_conversation") {
          try {
            const newConversation = await getOrCreateConversation(null, conversation.mode)
            conversation.id = newConversation.id
            conversation.title = newConversation.title ?? null
          } catch {
            process.stdout.write(
              `\r\n ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.amber)("could not create new conversation, continuing with current")}\r\n`,
            )
            continue
          }
          messageCount = 0
          sessionTokens = 0
          sessionStartTime = Date.now()
          lastUsage = undefined
          lastElapsed = undefined
          footer.unmount()
          console.clear()
          console.log()
          renderChatHeader(provider.modelName, conversation.mode)
          if (workspaceInfo) {
            console.log(renderWorkspaceBanner(workspaceInfo))
            console.log()
          }
          console.log(
            `  ${chalk.hex(theme.greenDim)("hint")} ${chalk.hex(theme.green)("·")} ${chalk.hex(theme.greenGlow)("/model")} to switch  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("Ctrl+V")} voice  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("/help")} for commands  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("Tab")} to cycle mode`,
          )
          console.log()
          footer.mount()
          footer.setTokens(0)
          process.stdout.write(
            ` ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.green)("started new conversation")}\r\n`,
          )
        } else if (result?.type === "unknown") {
          process.stdout.write(`\r\n ${chalk.hex(theme.red)("◆")} unknown slash command: ${trimmed.split(" ")[0]}\r\n\n`)
        } else if (result?.type === "message" && result.message) {
          if (result.skillContent) {
            loadedSkillName = result.skillName || ""
            loadedSkillContent = result.skillContent
            const taggedMsg = `[${result.skillName}]\n\n${result.message}`
            userMessage(taggedMsg)
            messageCount++
            await addMessage(conversation.id, "user", taggedMsg)
          } else {
            userMessage(trimmed)
            messageCount++
            await addMessage(conversation.id, "user", result.message)
            await trySetAutoTitle(conversation.id, result.message, messageCount)
          }
          try {
            const totalTokens = await loadContextTokens(conversation.id)
            const gate = await checkPlanGate(conversation.userId, provider.modelName, { totalTokens })
            if (!gate.allowed) {
              process.stdout.write(`\r\n ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.amber)(gate.message)}\r\n\n`)
            } else {
              const aiResult = await streamAIResponse(provider, conversation.id, conversation.mode, workspaceInfo, footer)
              if (aiResult.aborted) {
                process.stdout.write(` ${chalk.hex(theme.muted)("response aborted")}\r\n\n`)
              }
            }
            footer.renderLine()
          } catch (err: any) {
            const msg = err.message || String(err)
            process.stdout.write(`\r\n ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(msg)}\r\n\n`)
          } finally {
            if (result.skillContent) clearSkill()
          }
          readline.cursorTo(process.stdout, 0)
          continue
        } else {
          process.stdout.write("\r\n")
        }
        readline.cursorTo(process.stdout, 0)
        continue
      }

      // Strip @ refs from AI message — file content is already in system prompt
      const cleanInput = unquoted.replace(/@\S+/g, (m) => m.slice(1))

      if (loadedSkillContent) {
        // Skill instructions are injected as system context for this turn.
        // Keep the transcript and persisted user message focused on the user's request.
        const taggedMsg = `[${loadedSkillName}]\n\n${cleanInput}`
        userMessage(taggedMsg)
        messageCount++
        await addMessage(conversation.id, "user", taggedMsg)
      } else {
        userMessage(unquoted)
        messageCount++
        await addMessage(conversation.id, "user", cleanInput)
        await trySetAutoTitle(conversation.id, cleanInput, messageCount)
      }

      // Resolve referenced files (@ + drag-drop) into extra context
      const resolved = await resolveFileReferences(
        unquoted,
        workspaceInfo?.workspaceRoot,
        [...ddTracker.detectedFiles],
      )
      const loadedPaths = Object.keys(resolved.content)
      const fileContext =
        loadedPaths.length > 0
          ? Object.entries(resolved.content)
              .map(([filePath, content]) => {
                const rel = path.relative(
                  workspaceInfo!.workspaceRoot,
                  filePath,
                )
                return `<file path="${rel}">\n${content}\n</file>`
              })
              .join("\n\n")
          : undefined

      if (loadedPaths.length > 0) {
        process.stdout.write("\n")
        for (const fp of loadedPaths) {
          const rel = path.relative(workspaceInfo!.workspaceRoot, fp)
          process.stdout.write(
            ` ${chalk.hex(theme.green)("📄")} ${chalk.hex(theme.green)(rel)} loaded\n`,
          )
        }
        process.stdout.write("\n")
      }
      if (resolved.unresolved.length > 0) {
        for (const fp of resolved.unresolved) {
          process.stdout.write(
            ` ${chalk.hex(theme.amber)("⚠")} ${chalk.hex(theme.amber)(fp)} not found\n`,
          )
        }
      }

      try {
        const totalTokens = await loadContextTokens(conversation.id)
        const gate = await checkPlanGate(conversation.userId, provider.modelName, { totalTokens })
        if (!gate.allowed) {
          process.stdout.write(`\r\n ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.amber)(gate.message)}\r\n\n`)
          footer.renderLine()
          continue
        }
        const result = await streamAIResponse(provider, conversation.id, conversation.mode, workspaceInfo, footer, fileContext)

        if (result.aborted) {
          if (result.content && result.content !== "(cancelled)") {
            await addMessage(conversation.id, "assistant", result.content)
          }
          voiceAutoSubmitted = false
          process.stdout.write(`\r\n ${chalk.hex(theme.amber)("◆")} cancelled\r\n`)
          continue
        }

        if (result.modeSwitchRequested) {
          const wasRaw = process.stdin.isTTY && process.stdin.isRaw
          if (process.stdin.isTTY) process.stdin.setRawMode(false)
          const switchRl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          })
          const switchAnswer = await new Promise<string>((resolve) => {
            switchRl.question(
              `\r\n ${chalk.hex(theme.amber)("◆")} ${chalk.bold("Switch to agent mode?")} ${result.modeSwitchReason ? `(${result.modeSwitchReason}) ` : ""}[y/N] `,
              resolve,
            )
          })
          switchRl.close()
          if (wasRaw && process.stdin.isTTY) process.stdin.setRawMode(true)

          if (switchAnswer.trim().toLowerCase() === "y" || switchAnswer.trim().toLowerCase() === "yes") {
            conversation.mode = "agent"
            await updateConversationMode(conversation.id, "agent")
            footer.setMode("agent")
            const agentResult = await streamAIResponse(
              provider,
              conversation.id,
              "agent",
              workspaceInfo,
              footer,
            )
            if (agentResult.aborted) {
              voiceAutoSubmitted = false
              process.stdout.write(`\r\n ${chalk.hex(theme.amber)("◆")} cancelled\r\n`)
              continue
            }
            await addMessage(conversation.id, "assistant", agentResult.content)
            if (voiceAutoSubmitted) {
              voiceAutoSubmitted = false
              process.stdout.write("\r\n")
              await speakText(agentResult.content)
            }
            lastUsage = agentResult.usage
            lastElapsed = agentResult.elapsed
            await maybeCompactConversation(conversation.id)
            continue
          }
        }

        await addMessage(conversation.id, "assistant", result.content)
        if (voiceAutoSubmitted) {
          voiceAutoSubmitted = false
          process.stdout.write("\r\n")
          await speakText(result.content)
        }

        // Phase 8: in plan mode, persist the assistant's response to scratch
        // so /plan execute can pick it up.
        if (conversation.mode === "plan") {
          try {
            const { writeScratchMarkdown } = await import("src/lib/scratch.ts")
            const planPath = await writeScratchMarkdown("plan", result.content)
            process.stdout.write(
              `\r\n ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.muted)(`plan saved: ${planPath}`)} ${chalk.hex(theme.amber)("— /plan execute to run")}\r\n`,
            )
          } catch (err: any) {
            // Non-fatal — the plan is still in conversation history
            process.stdout.write(
              `\r\n ${chalk.hex(theme.muted)("◆")} ${chalk.hex(theme.muted)(`could not save plan: ${err?.message ?? "unknown"}`)}\r\n`,
            )
          }
        }

        lastUsage = result.usage
        lastElapsed = result.elapsed
        await maybeCompactConversation(conversation.id)
      } catch (error: any) {
        const errMsg = error?.message ?? "Unknown error"
        voiceAutoSubmitted = false
        process.stdout.write(`\r\n ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(errMsg)}\r\n\n`)
      } finally {
        clearSkill()
      }
    } catch (error: any) {
      // Catch-all: prevent any error from crashing the chat loop
      try {
        process.stdout.write(`\r\n ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.muted)(error?.message ?? "unexpected error, continuing")}\r\n`)
      } catch {
        // Terminal may be in a bad state; just try to continue
      }
      stdinResolve = null
      stdinInput = ""
      stdinCursor = 0
      stdinPrevWrapLines = 1
      if (process.stdin.isTTY) {
        try { process.stdin.setRawMode(true) } catch {}
      }
    }
  }
}

export async function startChat(
  provider: ModelProvider = "supercode",
  model?: string,
  conversationId?: string | null,
  workspaceInfo?: WorkspaceInfo,
  initialMode = "chat",
) {
  try {
    console.clear()
    console.log()

    const aiProvider = createProvider(provider, model)

    const modeLabel = initialMode === "agent" ? "agent" : "chat"
    const subtitle = modeLabel === "chat" ? `ai chat · ${aiProvider.modelName}` : `agent · ${aiProvider.modelName}`

    // ── Header ───────────────────────────────────────────────────
    const w = process.stdout.columns ?? 80
    const title = chalk.hex(theme.green).bold("SUPERCODE")
    const tagline = chalk.hex(theme.greenDim)(`${subtitle}`)
    const headerText = `${title}  ${tagline}`
    const headerLen = stripAnsi(headerText).length
    console.log(" ".repeat(Math.max(0, Math.floor((w - headerLen) / 2))) + headerText)
    console.log()

    // ── Mode + model status row ─────────────────────────────────
    console.log(
      statusBar({
        left: ["supercode", modeLabel, aiProvider.modelName],
        right: ["ready", "type to chat"],
      }),
    )
    console.log()

    if (workspaceInfo) {
      console.log(renderWorkspaceBanner(workspaceInfo))
      console.log()
    }

    // ── Quick-start hint ────────────────────────────────────────
    console.log(
      `  ${chalk.hex(theme.greenDim)("hint")} ${chalk.hex(theme.green)("·")} ${chalk.hex(theme.greenGlow)("/model")} to switch  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("Ctrl+V")} voice  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("/help")} for commands  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("Tab")} to cycle mode`,
    )
    console.log()

    const user = await getUserFromToken()
    currentUser = user
    const conversation = await initConversation(user.id, conversationId, initialMode)

    await chatLoop(aiProvider, conversation, workspaceInfo)
  } catch (error: any) {
    console.log()
    console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(error?.message ?? "Error")}`)
    console.log()
    process.exit(1)
  }
}

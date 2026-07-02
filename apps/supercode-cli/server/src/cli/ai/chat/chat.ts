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
import {
  permissionManager,
  setCurrentAgent,
  type PermissionPromptReply,
} from "src/tools/permission-manager.ts"
import { agentService, loadPrompt } from "src/agent/index.ts"
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
import { ThinkingDisplay, TurnTracker, toolLabel } from "./thinking.ts"
import { StepStatusRow } from "./step-status-row.ts"
import { MarkdownStream } from "src/cli/utils/markdown-stream.ts"
import { getContextWindow } from "src/cli/ai/context-windows.ts"
import type { WorkspaceInfo } from "src/cli/workspace/scanner.ts"
import { buildSystemPrompt } from "src/cli/workspace/context.ts"
import { tools } from "src/tools/registry.ts"
import { setDelegateRuntime } from "src/tools/definitions/delegate.ts"
import { CitationTracker } from "src/lib/citation-tracker.ts"
import { loadEnvOnce } from "src/lib/load-env"
import { renderWorkspaceBanner } from "src/cli/workspace/format.ts"
import { handleSlashCommand, isSlashCommand, COMMANDS } from "src/cli/commands/slashCommands/index.ts"
import {
  renderWriteSnapshot,
  renderEditSnapshot,
  renderCommandSnapshot,
  formatBytes,
  countDiff,
  diffLines,
} from "src/cli/utils/tool-snapshot.ts"
import { renderContextBreakdown } from "src/cli/commands/slashCommands/context-window.ts"
import { saveCliConfig } from "src/lib/cli-config"
import {
  voiceCaptureFlow,
  canVoiceCapture,
  abortCapture,
} from "src/voice/speech.ts"


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
 */
function renderToolSnapshot(toolName: string, args: unknown, resultRaw: string): void {
  try {
    if (toolName === "write_file") {
      const a = (args ?? {}) as { path?: string; content?: string }
      if (typeof a.path === "string" && typeof a.content === "string") {
        const meta = `${formatBytes(a.content.length)} · written`
        for (const line of renderWriteSnapshot(a.path, a.content, meta)) {
          process.stdout.write(line + "\n")
        }
      }
      return
    }

    if (toolName === "edit_file") {
      const a = (args ?? {}) as { path?: string; oldText?: string; newText?: string }
      if (typeof a.path === "string" && typeof a.oldText === "string" && typeof a.newText === "string") {
        const diff = diffLines(a.oldText, a.newText)
        const { adds, dels } = countDiff(diff)
        const meta = `${formatBytes(a.newText.length)} · +${adds} / −${dels}`
        for (const line of renderEditSnapshot(a.path, a.oldText, a.newText, meta)) {
          process.stdout.write(line + "\n")
        }
      }
      return
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
        const stdout = typeof (parsed as any).stdout === "string" ? (parsed as any).stdout : ""
        const stderr = typeof (parsed as any).stderr === "string" ? (parsed as any).stderr : ""
        const exitCode = typeof (parsed as any).exitCode === "number" ? (parsed as any).exitCode : 0
        for (const line of renderCommandSnapshot(a.command ?? "", stdout, stderr, exitCode)) {
          process.stdout.write(line + "\n")
        }
      }
      return
    }
  } catch {
    // Snapshot is best-effort. Never let a render bug break the chat loop.
  }
}

async function streamAIResponse(
  provider: AIProvider,
  conversationId: string,
  mode: string,
  workspaceInfo?: WorkspaceInfo,
  statusBar?: PersistentStatusBar,
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
      promptContent += `\n\n## Chat Mode Note\n\nYou are in chat mode. You have access to\ntools, but shell commands, file writes, and code execution require per-call\npermission prompts. If the user's task genuinely needs multiple such operations\nwithout interruptions, you may call the \`switch_to_agent_mode\` tool to request\nswitching to agent mode where all tools are auto-allowed. Call it ONCE with\na clear reason — the system will ask for user approval. Do NOT attempt\nrun_command/write_file/code_exec in the same response where you call\nswitch_to_agent_mode.`
    }

    if (mode === "plan") {
      promptContent += `\n\n## Plan Mode Note\n\nYou are in plan mode. You MUST NOT write files, run commands, or execute code. Produce a structured plan and stop. The user will review with /plan execute.`
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
  thinking.start("thinking")

  // Per-step live chain — ThinkingDisplay owns the spinner; we use the chain
  // directly here for per-step block rendering. Each AI step opens a
  // `▼ Thought: 0.0s` block, appends `┃   → Read foo.ts` rows as tools
  // fire, then auto-collapses to `+ Thought: N.Ns` when the step finishes.
  const chain = thinking.getChain()
  activeChain = chain

  // Live status row above the input prompt — shows model name, current
  // step, current tool, and elapsed time. Replaces the on-input
  // ThinkingDisplay spinner pattern (kept for non-TTY fallback) and the
  // previous noisy per-tool debug lines.
  const statusRow = new StepStatusRow()
  const agentName = mode === "plan" ? "plan" : (mode === "chat" ? "chat" : "build")
  statusRow.start(agentName, provider.modelName)
  // Publish to the module-scoped slot so the persistent footer's resize
  // handler can notify us too — StepStatusRow reserves no row of its own,
  // but its render math depends on the current terminal width.
  activeStatusRow = statusRow

  // Per-turn tool result tracker. Used to detect "all tools returned empty"
  // (the hallucination precursor) and to render empty tool calls in red.
  const turnTracker = new TurnTracker()

  // Phase 7: citation tracker — records every URL/file/search the model
  // uses so we can flag uncited factual claims in the response.
  const citationTracker = new CitationTracker()

  // Incremental markdown renderer. Buffers chunks and emits styled
  // terminal output (headings bold, lists bulleted, etc.) via marked-terminal.
  const md = new MarkdownStream()

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
    toolsToUse = { ...tools }
    // Ensure .env vars are loaded (Bun only auto-loads .env from CWD, which
    // may not be the server directory when launched from elsewhere).
    loadEnvOnce()
    // When Firecrawl is configured, remove the legacy web_search tool so the
    // model reliably uses firecrawl_search instead of falling back to Google CSE.
    if (process.env.FIRECRAWL_API_KEY) {
      delete (toolsToUse as Record<string, unknown>).web_search
    }
    // Wire the subagent runtime so the `delegate` tool can spawn focused subtasks.
    setDelegateRuntime({
      model: (provider as any).model ?? null,
      allTools: toolsToUse,
      onChunk: (chunk) => {
        if (isFirstChunk && !hasOutputHeader) {
          emitHeader()
          isFirstChunk = false
        }
        process.stdout.write(chalk.hex(theme.greenDim)(`  ${chunk}`))
      },
      onToolCall: ({ toolName, args }) => {
        if (!hasOutputHeader) emitHeader()
        thinking.showToolCall(toolName, args)
        chain.beginAndPrint()          // open per-step block (idempotent if already open)
        chain.printToolRow(toolName, args)
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
    const result = await provider.sendMessage(
      aiMessages as ModelMessage[],
      (chunk) => {
        if (isFirstChunk && !hasOutputHeader) {
          emitHeader()
          isFirstChunk = false
          statusRow.setStreaming()
        }
        md.push(chunk)
        fullResponse += chunk
      },
      toolsToUse,
      async ({ toolName, args }: { toolName: string; args?: unknown }) => {
        if (!hasOutputHeader) emitHeader()
        thinking.showToolCall(toolName, args)
        // Open a fresh per-step block on the first tool call of a step,
        // then append the tool row live. After onStepFinish we close +
        // auto-collapse (see process.onStepFinish callback below).
        chain.beginAndPrint()
        chain.printToolRow(toolName, args)
        statusRow.setCurrentTool(toolName, args)
        verbosePrint(toolName, args, provider.modelName, Date.now())
        // Mirror tool count to the status bar so users see "X tools" climb live.
        if (statusBar) statusBar.incTools()
      },
      abortController.signal,
      (reasoningChunk) => {
        fullReasoning += reasoningChunk
        thinking.showReasoning(reasoningChunk)
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

        // Render a snapshot/diff under the tool row for file-changing tools.
        // OpenCode-style: writes show the new file contents, edits show a
        // unified diff, commands show stdout. Skipped when the call failed.
        if (!entry.empty && !entry.permissionDenied && process.stdout.isTTY) {
          renderToolSnapshot(toolName, args, result as string)
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
        statusRow.setStepCount(stepNumber ?? chain.thoughts.length)
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

    // Flush any trailing markdown — finalizes the open block.
    md.end()

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
      md.end()
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
    md.end()
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
let activeChain: { thoughts: { endTime: number | null }[]; togglePrinted: (i: number) => void } | null = null
let stdinInput = ""
let stdinCursor = 0
let stdinMode = "chat"
let stdinResolve: ((value: { input: string; mode: string }) => void) | null = null
let stdinPromptLen = 0
let stdinPrevWrapLines = 1

// Set by the voice capture flow so the next chatInput() preserves the
// transcribed text instead of wiping stdinInput to "".
let voiceJustCaptured = false

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
  const totalChars = promptLen + stdinInput.length
  const wrapLines = Math.max(1, Math.ceil(totalChars / cols))

  // Clear old list + input from bottom to top
  const totalPrev = stdinPrevWrapLines + slashListLines
  // Move cursor down past all old content
  for (let i = 0; i < slashListLines; i++) {
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

  // Write prompt + input
  readline.cursorTo(process.stdout, 0)
  process.stdout.write(promptText() + stdinInput)
  stdinPrevWrapLines = wrapLines

  // Show slash list when input is exactly /
  slashListLines = 0
  if (stdinInput.startsWith("/") && stdinInput.length >= 1) {
    const filtered = filterSlashCommands(stdinInput)
    // Clamp selection to the filtered list length so we don't point past it
    if (slashSelected >= filtered.length) slashSelected = -1
    const divider = heavyDivider()
    process.stdout.write(`\r\n${divider}\r\n`)
    if (slashSelected === -1) {
      process.stdout.write(` ${chalk.hex(theme.amber)("❯")} ${stdinInput}\r\n`)
    }
    process.stdout.write(`${divider}\r\n`)
    filtered.forEach((c, i) => {
      if (slashSelected === i) {
        process.stdout.write(` ${chalk.hex(theme.amber)("▸")} ${chalk.hex(theme.green).bold(c.cmd.padEnd(22))}${chalk.hex(theme.white)(c.desc)}\r\n`)
      } else {
        process.stdout.write(` ${chalk.hex(theme.muted)(" ")} ${chalk.hex(theme.green)(c.cmd.padEnd(22))}${chalk.hex(theme.muted)(c.desc)}\r\n`)
      }
    })
    process.stdout.write(`${divider}`)
    // height: dividers (2) + header (1) + N commands + bottom divider (1) - selected line (1 if selected)
    const slashHeight = filtered.length === 0 ? 0 : 2 + 1 + filtered.length + 1 - (slashSelected >= 0 ? 1 : 0)
    slashListLines = slashHeight

    // Move cursor back up past the list to the input line
    for (let i = 0; i < slashListLines; i++) {
      readline.moveCursor(process.stdout, 0, -1)
    }
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

  // Enter/Escape during voice capture stops recording, doesn't submit
  if (voiceCaptureActive && (key.name === "return" || key.name === "enter" || key.name === "escape")) {
    abortCapture()
    return
  }

  if (key.name === "return" || key.name === "enter") {
    // If a slash command is selected via keyboard, execute it directly
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
      process.stdout.write("\r\n")
      const resolve = stdinResolve
      stdinResolve = null
      resolve({ input: cmd, mode: stdinMode })
      return
    }

    const resolve = stdinResolve
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
    process.stdout.write("\r\n")
    resolve({ input: stdinInput, mode: stdinMode })
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

  // Voice capture — F2 is the primary trigger (most reliable across terminals).
// Ctrl+Shift+V is also accepted but some terminals intercept it as a paste
// shortcut, and Node.js readline treats Ctrl+V as a "literal next" key
// which prevents the Shift+V combination from being detected reliably.
  const isVoiceKey =
    key.name === "F2" ||
    (key.ctrl && key.shift && (key.name === "v" || key.name === "V"))
  if (isVoiceKey) {
    if (!voiceCaptureActive) {
      voiceCaptureActive = true
      activeFooter?.setStatusMessage("🎤 Recording... (Enter to stop)")
      startVoiceCapture().finally(() => {
        voiceCaptureActive = false
        activeFooter?.setStatusMessage("")
      })
    }
    return
  }

  if (_str && _str.length === 1 && !key.ctrl && !key.meta) {
    stdinInput = stdinInput.slice(0, stdinCursor) + _str + stdinInput.slice(stdinCursor)
    stdinCursor++
    slashSelected = -1
    historyIndex = -1
    renderInput()
    return
  }
}

async function startVoiceCapture() {
  const check = canVoiceCapture()
  if (!check.ok) {
    activeFooter?.setStatusMessage("⛭ Voice unavailable: " + (check.reason ?? "unknown"))
    setTimeout(() => activeFooter?.setStatusMessage(""), 4000)
    return
  }
  try {
    const text = await voiceCaptureFlow()
    if (text) {
      stdinInput =
        stdinInput.slice(0, stdinCursor) + text + " " + stdinInput.slice(stdinCursor)
      stdinCursor += text.length + 1
      // Don't call renderInput here — the chat loop will call chatInput() next,
      // which preserves stdinInput (via voiceJustCaptured) and renders it once.
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Voice capture failed"
    activeFooter?.setStatusMessage("⛭ " + msg)
    setTimeout(() => activeFooter?.setStatusMessage(""), 4000)
  }
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

async function chatInput(currentMode: string): Promise<{ input: string; mode: string }> {
  stdinMode = modes.includes(currentMode) ? currentMode : "chat"
  applyModePermissions(stdinMode)
  // If voice capture just populated stdinInput, preserve it so the user can
  // see and edit the transcription. Otherwise reset to empty as usual.
  if (!voiceJustCaptured) {
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
  }

  let messageCount = 0
  let sessionTokens = 0
  let provider = initialProvider
  let contextWindow = getContextWindow(provider.modelName)
  let sessionStartTime = Date.now()
  let lastUsage: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined = undefined
  let lastElapsed: number | undefined = undefined

  // Persistent footer bar (matches OpenCode's always-there status line).
  // The bar reserves the row immediately below the prompt so it stays anchored
  // through every keystroke, every tool call, and every response.
  const footer = new PersistentStatusBar()
  activeFooter = footer
  footer.setMode(conversation.mode)
  footer.setModel(provider.modelName)
  footer.setContextWindow(contextWindow)
  footer.setTokens(0)
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
            footer.setContextWindow(contextWindow)
            process.stdout.write(`\r\n ${chalk.hex(theme.green)("◆")} switched to ${chalk.hex(theme.green)(label)}\r\n\n`)
            saveCliConfig({ provider: result.provider!, model: result.model || provider.modelName, mode: conversation.mode as "chat" | "agent" })
          }
        } else if (result?.type === "connect") {
          if (result.provider) {
            const newProvider = createProvider(result.provider, provider.modelName)
            if (newProvider) {
              provider = newProvider
              contextWindow = getContextWindow(provider.modelName)
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
        } else if (result?.type === "verbose") {
          verboseMode = !verboseMode
          process.stdout.write(
            `\r\n ${chalk.hex(theme.green)("◆")} verbose mode ${verboseMode ? chalk.hex(theme.green)("on") : chalk.hex(theme.greenDim)("off")} — ${verboseMode ? "per-tool debug lines enabled" : "clean UI"}\r\n\n`,
          )
        } else if (result?.type === "unknown") {
          process.stdout.write(`\r\n ${chalk.hex(theme.red)("◆")} unknown slash command: ${trimmed.split(" ")[0]}\r\n\n`)
        } else {
          process.stdout.write("\r\n")
        }
        readline.cursorTo(process.stdout, 0)
        continue
      }

      userMessage(unquoted)
      messageCount++

      await addMessage(conversation.id, "user", unquoted)
      await trySetAutoTitle(conversation.id, unquoted, messageCount)

      try {
        const result = await streamAIResponse(provider, conversation.id, conversation.mode, workspaceInfo, footer)

        if (result.aborted) {
          if (result.content && result.content !== "(cancelled)") {
            await addMessage(conversation.id, "assistant", result.content)
          }
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
              process.stdout.write(`\r\n ${chalk.hex(theme.amber)("◆")} cancelled\r\n`)
              continue
            }
            await addMessage(conversation.id, "assistant", agentResult.content)
            lastUsage = agentResult.usage
            lastElapsed = agentResult.elapsed
            continue
          }
        }

        await addMessage(conversation.id, "assistant", result.content)

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
      } catch (error: any) {
        const errMsg = error?.message ?? "Unknown error"
        process.stdout.write(`\r\n ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(errMsg)}\r\n\n`)
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
  provider: ModelProvider = "concentrateai",
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
      `  ${chalk.hex(theme.greenDim)("hint")} ${chalk.hex(theme.green)("·")} ${chalk.hex(theme.greenGlow)("/model")} to switch  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("F2")} voice  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("/help")} for commands  ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("Tab")} to cycle mode`,
    )
    console.log()

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

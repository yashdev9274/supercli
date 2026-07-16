import { stepCountIs, streamText, type LanguageModel, type ToolSet } from "ai"
import type { Agent, GenerateOptions, GenerateResult } from "./agent"
import { loadPrompt } from "./prompt-loader"
import { isEmptyToolResult, summarizeToolResult } from "src/cli/ai/tool-result"

interface StepEvent {
  toolCalls?: Array<{ toolName: string; input?: unknown }>
  toolResults?: Array<{ toolName?: string; input?: unknown; output?: unknown }>
  text?: string
  finishReason?: string
}

const DEFAULT_SUBAGENT_BUDGET = 6
const DEFAULT_PRIMARY_BUDGET = 50

const DESTRUCTIVE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "run_command",
  "code_exec",
])

const READ_TOOLS = new Set([
  "read_file",
  "search_files",
  "read_instructions",
  "url_fetch",
  "web_search",
  "firecrawl_search",
  "firecrawl_scrape",
  "firecrawl_map",
  "exa_search",
  "exa_fetch",
])

export async function runAgent(
  agent: Agent,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const budget = opts.budget ?? agent.info.steps ?? DEFAULT_SUBAGENT_BUDGET

  // Resolve system prompt: explicit override > prompt-file > undefined
  let systemPrompt: string | undefined = opts.system
  if (!systemPrompt && agent.info.prompt) {
    systemPrompt = await loadPrompt(agent.info.prompt)
  }
  if (!systemPrompt && agent.resolvePrompt) {
    systemPrompt = agent.resolvePrompt(opts.system)
  }

  // Build the tool set, but tag each tool with the calling agent so
  // permission checks respect the agent's ruleset (Phase 5 enforcement).
  // If a parent agent spawned this agent, pass parent info for permission chaining.
  const tools: ToolSet | undefined = opts.tools
    ? wrapToolsWithAgent(agent, opts.tools, opts.parentAgent)
    : undefined

  // Track structured output for the parent agent
  const filesRead = new Set<string>()
  const filesChanged = new Set<string>()
  const citations: Array<{ url: string; quote: string }> = []
  let fullText = ""
  let fullToolCalls: Array<{ toolName: string; args?: unknown }> = []
  let inputTokens = 0
  let outputTokens = 0

  // Track tool results across steps for the empty-result sentinel
  const seenStepResults: Array<{ toolName: string; result: string }> = []
  // Track tool call repetition — same tool + same args 3+ times signals a loop
  const toolCallHistory: Array<{ toolName: string; argsKey: string }> = []
  let stopForRepetition = false

  const messages = buildMessages(opts)

  try {
    const result = streamText({
      model: opts.model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(budget),
      abortSignal: opts.signal,
      onChunk: async ({ chunk }) => {
        if (chunk.type === "text-delta") {
          fullText += chunk.text
          opts.onChunk?.(chunk.text)
        }
      },
      prepareStep: async () => {
        if (opts.signal?.aborted) return undefined
        if (stopForRepetition) {
          return {
            messages: [{
              role: "system" as const,
              content:
                "SYSTEM NOTICE: You have called the same tools with the same arguments " +
                "multiple times without making progress. Stop repeating yourself. " +
                "Analyze what you already know and respond to the user.",
            }],
          }
        }
        if (seenStepResults.length === 0) return undefined
        const allEmpty = seenStepResults.every((r) => isEmptyToolResult(r.result))
        if (!allEmpty) return undefined
        const summary = seenStepResults
          .map((r) => `- ${r.toolName}: ${summarizeToolResult(r.result)}`)
          .join("\n")
        return {
          messages: [
            ...messages,
            {
              role: "system" as const,
              content:
                "SYSTEM NOTICE: All tool calls in the previous step returned empty or error results. " +
                "You have NO source material to work with. Do NOT fabricate data, assume defaults, " +
                "or proceed with guesswork. Re-check your inputs and retry with different parameters, " +
                "or tell the user which tools failed.\n\nTool outcomes:\n" + summary,
            },
          ],
        }
      },
      onStepFinish: async (event: StepEvent) => {
        if (event.text) fullText += event.text
        if (event.toolCalls?.length) {
          for (const tc of event.toolCalls) {
            const toolName = tc.toolName
            fullToolCalls.push({ toolName, args: tc.input })
            opts.onToolCall?.({ toolName, args: tc.input })

            // Track structural artifacts
            const args = (tc.input ?? {}) as Record<string, unknown>
            if (READ_TOOLS.has(toolName) && typeof args.path === "string") {
              filesRead.add(args.path)
            }
            if (DESTRUCTIVE_TOOLS.has(toolName)) {
              const target =
                typeof args.path === "string"
                  ? args.path
                  : typeof args.command === "string"
                    ? args.command.slice(0, 80)
                    : typeof args.code === "string"
                      ? args.code.slice(0, 80)
                      : "(unknown)"
              filesChanged.add(target)
            }
            if (toolName === "url_fetch" && typeof args.url === "string") {
              citations.push({ url: args.url, quote: "" })
            }
          }
        }
        // Per-step tool results for the prepareStep sentinel — reset each
        // step so the sentinel only checks the PREVIOUS step's results.
        // Without this, one successful tool call permanently disarms the
        // empty-result guard and the model can hallucinate for budget-1 steps.
        seenStepResults.length = 0
        if (event.toolResults?.length) {
          for (const tr of event.toolResults) {
            const name = tr.toolName ?? "unknown"
            const out = (tr as any).output
            const text =
              typeof out === "string"
                ? out
                : out === undefined || out === null
                  ? ""
                  : JSON.stringify(out)
            seenStepResults.push({ toolName: name, result: text })
          }
        }
        // Tool call repetition guard: same tool + same args 3+ times → stop.
        if (event.toolCalls?.length) {
          for (const tc of event.toolCalls) {
            const args = tc.input ?? {}
            const argsKey = JSON.stringify(args)
            toolCallHistory.push({ toolName: tc.toolName, argsKey })
            // Count how many times this exact call appeared in the window
            let count = 0
            for (const h of toolCallHistory) {
              if (h.toolName === tc.toolName && h.argsKey === argsKey) count++
            }
            if (count >= 3) {
              stopForRepetition = true
              break
            }
          }
          // Prune history to last 12 calls to avoid unbounded memory
          if (toolCallHistory.length > 12) {
            toolCallHistory.splice(0, toolCallHistory.length - 12)
          }
        }
        opts.onStepFinish?.(event)
      },
    })

    await result.consumeStream()

    const usage = await result.usage
    inputTokens = usage?.inputTokens ?? 0
    outputTokens = usage?.outputTokens ?? 0
    const finishReason = await result.finishReason

    return {
      text: fullText,
      toolCalls: fullToolCalls,
      finishReason: typeof finishReason === "string" ? finishReason : undefined,
      tokens: { input: inputTokens, output: outputTokens },
      filesRead: Array.from(filesRead),
      filesChanged: Array.from(filesChanged),
    }
  } catch (error: any) {
    return {
      text: fullText,
      toolCalls: fullToolCalls,
      finishReason: "error",
      tokens: { input: inputTokens, output: outputTokens },
      filesRead: Array.from(filesRead),
      filesChanged: Array.from(filesChanged),
      error: error?.message ?? String(error),
    }
  }
}

function buildMessages(
  opts: GenerateOptions,
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  if (opts.messages?.length) return opts.messages
  if (opts.prompt) return [{ role: "user", content: opts.prompt }]
  return []
}

/**
 * Wrap a tool's `execute` so every call is gated by the agent's own
 * permission ruleset, not the global one. This is the Phase 5 fix.
 *
 * The implementation has to be light-touch because the AI SDK hands us
 * already-wrapped `tool()` instances. We replace `execute` with a
 * shim that calls permissionManager.check(name, input, { agentName }).
 */
function wrapToolsWithAgent(
  agent: Agent,
  tools: Record<string, unknown>,
  parentAgentName?: string,
): ToolSet {
  const wrapped: ToolSet = {}
  for (const [name, t] of Object.entries(tools)) {
    const tt = t as { execute?: (...args: any[]) => any; description?: string }
    if (!tt.execute) {
      // passthrough for tools with no execute (rare)
      wrapped[name] = t as any
      continue
    }
    const originalExecute = tt.execute
    wrapped[name] = {
      ...(tt as any),
      execute: async (input: any, execOptions: any) => {
        // Defer permission check to runtime — we monkey-patch
        // permissionManager via thread-local agent references.
        const { setCurrentAgent, getCurrentAgent, setParentAgent, getParentAgent, permissionManager } =
          await import("src/tools/permission-manager.ts")
        const previous = getCurrentAgent()
        const previousParent = getParentAgent()
        setCurrentAgent(agent.info.name)
        setParentAgent(parentAgentName)
        try {
          const args = typeof input === "object" && input !== null ? input : {}
          const allowed = await permissionManager.check(name, args as Record<string, unknown>)
          if (!allowed) {
            return JSON.stringify({
              success: false,
              cancelled: true,
              reason: `Permission denied by ${agent.info.name} ruleset`,
            })
          }
          return await originalExecute(input, execOptions)
        } finally {
          setCurrentAgent(previous)
          setParentAgent(previousParent)
        }
      },
    }
  }
  return wrapped
}
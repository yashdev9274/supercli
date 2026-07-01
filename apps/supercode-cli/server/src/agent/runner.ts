import { stepCountIs, streamText, type LanguageModel, type ToolSet } from "ai"
import type { Agent, GenerateOptions, GenerateResult } from "./agent"
import { loadPrompt } from "./prompt-loader"

interface StepEvent {
  toolCalls?: Array<{ toolName: string; input?: unknown }>
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
  const tools: ToolSet | undefined = opts.tools
    ? wrapToolsWithAgent(agent, opts.tools)
    : undefined

  // Track structured output for the parent agent
  const filesRead = new Set<string>()
  const filesChanged = new Set<string>()
  const citations: Array<{ url: string; quote: string }> = []
  let fullText = ""
  let fullToolCalls: Array<{ toolName: string; args?: unknown }> = []
  let inputTokens = 0
  let outputTokens = 0

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
function wrapToolsWithAgent(agent: Agent, tools: Record<string, unknown>): ToolSet {
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
        // Defer permission check to runtime — the agent is determined by the
        // caller's context. We can't easily inject the agentName into the AI
        // SDK's tool-execution context, so we monkey-patch permissionManager
        // via a thread-local current-agent reference.
        const { setCurrentAgent, getCurrentAgent, permissionManager } = await import(
          "src/tools/permission-manager.ts"
        )
        const previous = getCurrentAgent()
        setCurrentAgent(agent.info.name)
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
        }
      },
    }
  }
  return wrapped
}
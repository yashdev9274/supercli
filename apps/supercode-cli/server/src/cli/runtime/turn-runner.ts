import { createHarness, type GenerateOptions, type GenerateResult } from "src/agents"
import type { ModelMessage } from "ai"
import { createEventBus, type EventBus, type TurnEvent } from "./event-bus.ts"
import {
  resolveProvider,
  runProviderStreamTurn,
  type ResolvedProvider,
} from "./provider-bridge.ts"
import type { ModelProvider } from "src/cli/ai/provider"

export type TurnRunnerOptions = GenerateOptions & {
  agent?: string
  /** Optional external bus; one is created per turn if omitted. */
  bus?: EventBus
  onEvent?: (event: TurnEvent) => void
}

/**
 * Single path for interactive turns when a LanguageModel is already resolved.
 * Thinking vs Result cleanup lives inside the harness for every provider/model.
 */
export async function runHarnessTurn(opts: TurnRunnerOptions): Promise<GenerateResult> {
  const bus = opts.bus ?? createEventBus()
  const unsub = opts.onEvent ? bus.subscribe(opts.onEvent) : () => {}

  bus.emit({ type: "status", message: "running turn" })

  const harness = createHarness()

  try {
    const result = await harness.runTurn({
      ...opts,
      onStatus: (message) => {
        bus.emit({ type: "status", message })
        opts.onStatus?.(message)
      },
      onChunk: (chunk) => {
        bus.emit({ type: "text", delta: chunk })
        opts.onChunk?.(chunk)
      },
      onReasoning: (chunk) => {
        bus.emit({ type: "reasoning", delta: chunk })
        opts.onReasoning?.(chunk)
      },
      onToolCall: (params) => {
        bus.emit({
          type: "tool_start",
          toolName: params.toolName,
          args: params.args,
        })
        opts.onToolCall?.(params)
      },
      onToolResult: (params) => {
        bus.emit({
          type: "tool_end",
          toolName: params.toolName,
          result: params.result,
        })
        opts.onToolResult?.(params)
      },
    })

    bus.emit({
      type: "finish",
      text: result.text,
      reasoning: result.reasoning,
      finishReason: result.finishReason,
    })

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    bus.emit({ type: "error", message, cause: err })
    throw err
  } finally {
    unsub()
  }
}

export type UnifiedTurnOptions = {
  provider: ModelProvider | string
  modelId: string
  agent?: string
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>
  system?: string
  tools?: Record<string, unknown>
  signal?: AbortSignal
  bus?: EventBus
  onEvent?: (event: TurnEvent) => void
  budget?: number
}

/**
 * Preferred entry: resolve provider, then harness (LanguageModel) or streamTurn
 * (proxy sendMessage). Both paths share event-bus shapes + Result gate.
 */
export async function runUnifiedTurn(opts: UnifiedTurnOptions): Promise<GenerateResult> {
  const bus = opts.bus ?? createEventBus()
  const resolved: ResolvedProvider = resolveProvider({
    provider: opts.provider,
    model: opts.modelId,
  })

  if (resolved.languageModel) {
    return runHarnessTurn({
      agent: opts.agent,
      model: resolved.languageModel,
      tools: opts.tools,
      messages: opts.messages,
      system: opts.system,
      signal: opts.signal,
      budget: opts.budget,
      bus,
      onEvent: opts.onEvent,
    })
  }

  // Proxy / sendMessage-only adapters
  const modelMessages: ModelMessage[] = []
  if (opts.system) {
    modelMessages.push({ role: "system", content: opts.system })
  }
  for (const m of opts.messages) {
    modelMessages.push({ role: m.role, content: m.content })
  }

  const stream = await runProviderStreamTurn({
    provider: resolved.provider,
    messages: modelMessages,
    tools: opts.tools,
    signal: opts.signal,
    bus,
    onEvent: opts.onEvent,
  })

  return {
    text: stream.text,
    reasoning: stream.reasoning,
    finishReason: stream.finishReason,
  }
}

/** Map interactive mode → harness agent id. */
export function agentIdForMode(mode: string): string {
  switch (mode) {
    case "plan":
      return "plan"
    case "agent":
    case "build":
      return "build"
    case "explore":
      return "explore"
    case "general":
      return "general"
    case "chat":
    default:
      // Primary interactive chat uses build agent (full tools + write).
      return "build"
  }
}

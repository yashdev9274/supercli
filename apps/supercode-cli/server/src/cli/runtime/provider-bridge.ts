import type { LanguageModel, ModelMessage } from "ai"
import {
  createProvider,
  type AIProvider,
  type ModelProvider,
} from "src/cli/ai/provider"
import {
  createThinkSplitter,
  finalizeAnswerVsProcess,
} from "src/runtime/stream/split-think-content.ts"
import type { EventBus, TurnEvent } from "./event-bus.ts"

export type ResolvedProvider = {
  provider: AIProvider
  /** Present when the adapter exposes an AI SDK LanguageModel (direct BYOK). */
  languageModel?: LanguageModel
}

/**
 * Uniform provider surface for the harness / turn-runner.
 * Direct adapters often expose `.model`; proxy adapters only expose sendMessage.
 */
export function resolveProvider(opts: {
  provider: ModelProvider | string
  model: string
}): ResolvedProvider {
  const provider = createProvider(opts.provider as ModelProvider, opts.model)
  const languageModel = (provider as AIProvider).model as LanguageModel | undefined
  return {
    provider,
    languageModel: languageModel || undefined,
  }
}

export async function resolveLanguageModel(opts: {
  provider: ModelProvider | string
  model: string
}): Promise<{ model: LanguageModel; provider: AIProvider }> {
  const resolved = resolveProvider(opts)
  if (!resolved.languageModel) {
    throw new Error(
      `Provider '${opts.provider}' does not expose a LanguageModel. ` +
        "Use runProviderStreamTurn for proxy/sendMessage adapters.",
    )
  }
  return { model: resolved.languageModel, provider: resolved.provider }
}

export type StreamTurnResult = {
  text: string
  reasoning?: string
  finishReason?: string
  usage?: unknown
}

/**
 * Proxy / sendMessage path that emits the **same** TurnEvent shapes as the harness.
 * Always runs think-split (streaming) + finalizeAnswerVsProcess (end of turn).
 */
export async function runProviderStreamTurn(opts: {
  provider: AIProvider
  messages: ModelMessage[]
  tools?: unknown
  signal?: AbortSignal
  bus?: EventBus
  onEvent?: (event: TurnEvent) => void
  onChunk?: (chunk: string) => void
  onReasoning?: (chunk: string) => void
  onToolCall?: (params: { toolName: string; args?: unknown }) => void
  onToolResult?: (params: {
    toolName: string
    args?: unknown
    result?: string
  }) => void
}): Promise<StreamTurnResult> {
  const unsub = opts.bus && opts.onEvent ? opts.bus.subscribe(opts.onEvent) : () => {}
  const emit = (event: TurnEvent) => opts.bus?.emit(event)

  emit({ type: "status", message: "running turn" })

  const split = createThinkSplitter()
  let textAcc = ""
  let reasoningAcc = ""

  try {
    const result = await opts.provider.sendMessage(
      opts.messages,
      (chunk) => {
        const parts = split.push(chunk)
        if (parts.reasoning) {
          reasoningAcc += parts.reasoning
          emit({ type: "reasoning", delta: parts.reasoning })
          opts.onReasoning?.(parts.reasoning)
        }
        if (parts.text) {
          textAcc += parts.text
          emit({ type: "text", delta: parts.text })
          opts.onChunk?.(parts.text)
        }
      },
      opts.tools,
      (params: { toolName: string; args?: unknown }) => {
        emit({
          type: "tool_start",
          toolName: params.toolName,
          args: params.args,
        })
        opts.onToolCall?.(params)
      },
      opts.signal,
      (reasoningChunk: string) => {
        reasoningAcc += reasoningChunk
        emit({ type: "reasoning", delta: reasoningChunk })
        opts.onReasoning?.(reasoningChunk)
      },
      (params: { toolName: string; args: unknown; result: string }) => {
        emit({
          type: "tool_end",
          toolName: params.toolName,
          result: params.result,
        })
        opts.onToolResult?.(params)
      },
    )

    const flushed = split.flush()
    if (flushed.reasoning) {
      reasoningAcc += flushed.reasoning
      emit({ type: "reasoning", delta: flushed.reasoning })
      opts.onReasoning?.(flushed.reasoning)
    }
    if (flushed.text) {
      textAcc += flushed.text
      emit({ type: "text", delta: flushed.text })
      opts.onChunk?.(flushed.text)
    }

    // Prefer provider content if longer (some paths buffer full text only at end)
    const raw = (result.content || textAcc || "").trim()
      ? result.content || textAcc
      : textAcc
    const final = finalizeAnswerVsProcess(raw, reasoningAcc)
    if (final.reasoning && final.reasoning !== reasoningAcc) {
      const extra = final.reasoning.slice(reasoningAcc.length).trim()
      if (extra) {
        emit({ type: "reasoning", delta: extra })
        opts.onReasoning?.(extra)
      }
    }

    emit({
      type: "finish",
      text: final.text,
      reasoning: final.reasoning || undefined,
      finishReason: typeof result.finishReason === "string" ? result.finishReason : undefined,
    })

    return {
      text: final.text,
      reasoning: final.reasoning || undefined,
      finishReason:
        typeof result.finishReason === "string" ? result.finishReason : undefined,
      usage: result.usage,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    emit({ type: "error", message, cause: err })
    throw err
  } finally {
    unsub()
  }
}

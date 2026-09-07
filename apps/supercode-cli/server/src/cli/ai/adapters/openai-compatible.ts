import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import {
  streamText,
  stepCountIs,
  type FinishReason,
  type LanguageModel,
  type ModelMessage,
} from "ai"
import chalk from "chalk"
import { executeToolLoop } from "../tool-executor.ts"
import {
  isEmptyToolResult,
  isDeniedToolResult,
  summarizeToolResult,
  tcName,
} from "../tool-result"
import {
  prepareMessages,
  hasTools,
  trackProviderUsage,
  createStreamGuard,
  friendlyGatewayError,
  drainReasoningStream,
} from "./stream-helpers"
import type { SendMessageArgs, SendMessageResult } from "./types"

export type ToolLoopMode = "execute" | "native" | "auto"

export type OpenAICompatibleAdapterOptions = {
  /** Stable provider id used in usage telemetry (e.g. "nvidia"). */
  providerId: string
  /** Human label for logs / errors (e.g. "NVIDIA NIM"). */
  providerLabel: string
  /** createOpenAICompatible name field. */
  clientName: string
  baseURL: string
  apiKey: string
  modelName: string
  /** Missing-key error body (already formatted). */
  missingKeyError: string
  headers?: Record<string, string>
  fetch?: typeof fetch
  /** Models that should not receive maxOutputTokens caps. */
  highValueModels?: string[]
  defaultMaxOutputTokens?: number
  /**
   * How tool rounds run:
   * - execute: manual executeToolLoop (nvidia/mergedev/orcarouter/minimax)
   * - native: AI SDK multi-step streamText + prepareStep guards (concentrate)
   * - auto: execute when tools present (default)
   */
  toolLoop?: ToolLoopMode
  /** Overall stream timeout; 0 disables. Default 120s for gateways, 0 for simple. */
  streamTimeoutMs?: number
  /** First-token timeout (concentrate). 0 = off. */
  firstTokenMs?: number
  /** Optional hook before send (e.g. opus daily limit). */
  beforeSend?: (modelName: string) => Promise<void>
  /** Optional empty-stream non-streaming fallback (concentrate). */
  emptyStreamFallback?: (opts: {
    modelName: string
    system: string
    messages: ModelMessage[]
    tools?: unknown
  }) => Promise<{ content: string; usage?: { prompt_tokens?: number; completion_tokens?: number } } | null>
  /** Extra streamText options merger. */
  streamOptions?: (modelName: string) => Record<string, unknown>
  /** Prefer fullStream for reasoning-delta (concentrate). */
  useFullStream?: boolean
  /** maxSteps for native tool loop (default 8). */
  maxSteps?: number
  /** Log label color errors with chalk. */
  logErrors?: boolean
}

export class OpenAICompatibleAdapter {
  model: LanguageModel
  readonly modelName: string
  readonly providerId: string
  readonly providerLabel: string
  private opts: OpenAICompatibleAdapterOptions

  constructor(opts: OpenAICompatibleAdapterOptions) {
    if (!opts.apiKey) {
      throw new Error(opts.missingKeyError)
    }
    this.opts = opts
    this.providerId = opts.providerId
    this.providerLabel = opts.providerLabel
    this.modelName = opts.modelName

    const client = createOpenAICompatible({
      name: opts.clientName,
      baseURL: opts.baseURL,
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        ...opts.headers,
      },
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
    })
    this.model = client.chatModel(this.modelName)
  }

  private maxOutputTokensOpts(): Record<string, unknown> {
    const high = this.opts.highValueModels ?? []
    if (high.includes(this.modelName)) return {}
    const cap = this.opts.defaultMaxOutputTokens
    if (cap == null) return {}
    return { maxOutputTokens: cap }
  }

  async sendMessage(args: SendMessageArgs): Promise<SendMessageResult>
  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
    onToolResult?: any,
    onStepFinish?: any,
    onStepBudget?: (maxSteps: number) => void,
  ): Promise<SendMessageResult>
  async sendMessage(
    messagesOrArgs: ModelMessage[] | SendMessageArgs,
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
    onToolResult?: any,
    onStepFinish?: any,
    onStepBudget?: (maxSteps: number) => void,
  ): Promise<SendMessageResult> {
    const args: SendMessageArgs = Array.isArray(messagesOrArgs)
      ? {
          messages: messagesOrArgs,
          onChunk,
          tools,
          onToolCall,
          signal,
          onReasoning,
          onToolResult,
          onStepFinish,
          onStepBudget,
        }
      : messagesOrArgs

    const timeoutDefault =
      this.opts.streamTimeoutMs !== undefined ? this.opts.streamTimeoutMs : 120_000
    const firstTokenMs =
      this.opts.firstTokenMs !== undefined
        ? this.opts.firstTokenMs
        : 0
    const guard = createStreamGuard({
      signal: args.signal,
      timeoutMs: timeoutDefault,
      firstTokenMs,
    })

    try {
      await this.opts.beforeSend?.(this.modelName)

      const { system, messages } = prepareMessages(args.messages)
      const toolsPresent = hasTools(args.tools)
      const toolLoop = this.opts.toolLoop ?? "auto"
      const useNative =
        toolLoop === "native" || (toolLoop === "auto" && false) // auto → execute
      const useExecute = toolsPresent && (toolLoop === "execute" || toolLoop === "auto")

      if (!toolsPresent) {
        return await this.streamPlain({
          system,
          messages,
          args,
          abortSignal: guard.controller.signal,
          markActivity: guard.markActivity,
        })
      }

      if (useExecute && !useNative) {
        const { content, usage } = await executeToolLoop(
          this.model,
          messages,
          system,
          args.tools as any,
          {
            onChunk: (c) => {
              guard.markActivity()
              args.onChunk?.(c)
            },
            onToolCall: args.onToolCall,
            onReasoning: (c) => {
              guard.markActivity()
              args.onReasoning?.(c)
            },
            onToolResult: args.onToolResult,
            onStepFinish: args.onStepFinish,
            signal: guard.controller.signal,
          },
        )
        const resolved = await usage
        trackProviderUsage({
          provider: this.providerId,
          model: this.modelName,
          usage: resolved ?? {},
        })
        return {
          content,
          finishReason: "stop" as FinishReason,
          usage: resolved,
        }
      }

      // Native multi-step path (concentrate-style)
      const maxSteps = this.opts.maxSteps ?? 8
      args.onStepBudget?.(maxSteps)
      return await this.streamNativeTools({
        system,
        messages,
        args,
        abortSignal: guard.controller.signal,
        markActivity: guard.markActivity,
        maxSteps,
      })
    } catch (error: any) {
      if (error?.name === "AbortError" || guard.controller.signal.aborted) {
        if (firstTokenMs > 0 && guard.firstTokenTimedOut()) {
          throw new Error(
            `No response from model within ${Math.round(firstTokenMs / 1000)}s. ` +
              "The provider may be overloaded — try again or run /model to switch.",
          )
        }
        throw error?.name === "AbortError"
          ? error
          : new DOMException("Aborted", "AbortError")
      }
      const friendly = friendlyGatewayError(this.providerLabel, error)
      const toThrow = friendly ?? error
      if (this.opts.logErrors !== false) {
        console.error(
          chalk.red(`${this.providerLabel} Service Error:`),
          toThrow instanceof Error ? toThrow.message : String(toThrow),
        )
      }
      throw toThrow
    } finally {
      guard.cleanup()
    }
  }

  private async streamPlain(opts: {
    system: string
    messages: ModelMessage[]
    args: SendMessageArgs
    abortSignal: AbortSignal
    markActivity: () => void
  }): Promise<SendMessageResult> {
    const extra = {
      ...this.maxOutputTokensOpts(),
      ...(this.opts.streamOptions?.(this.modelName) ?? {}),
    }
    const result = streamText({
      model: this.model,
      messages: opts.messages,
      system: opts.system || undefined,
      abortSignal: opts.abortSignal,
      ...extra,
    })

    let fullResponse = ""

    if (this.opts.useFullStream) {
      for await (const event of result.fullStream) {
        opts.markActivity()
        if (event.type === "text-delta") {
          if (event.text == null) continue
          fullResponse += event.text
          opts.args.onChunk?.(event.text)
        } else if (event.type === "reasoning-delta") {
          if (event.text) opts.args.onReasoning?.(event.text)
        }
      }
    } else {
      await Promise.all([
        drainReasoningStream(result, (c) => {
          opts.markActivity()
          opts.args.onReasoning?.(c)
        }),
        (async () => {
          for await (const chunk of result.textStream) {
            opts.markActivity()
            fullResponse += chunk
            opts.args.onChunk?.(chunk)
          }
        })(),
      ])
    }

    if (!fullResponse.trim() && this.opts.emptyStreamFallback) {
      const fb = await this.opts.emptyStreamFallback({
        modelName: this.modelName,
        system: opts.system,
        messages: opts.messages,
        tools: undefined,
      })
      const content = fb?.content ?? ""
      if (content) opts.args.onChunk?.(content)
      const inputTokens = fb?.usage?.prompt_tokens ?? 0
      const outputTokens = fb?.usage?.completion_tokens ?? 0
      const usage = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputTokenDetails: {
          noCacheTokens: undefined as number | undefined,
          cacheReadTokens: 0,
          cacheWriteTokens: undefined as number | undefined,
        },
        outputTokenDetails: {
          textTokens: undefined as number | undefined,
          reasoningTokens: undefined as number | undefined,
        },
      }
      trackProviderUsage({
        provider: this.providerId,
        model: this.modelName,
        usage,
      })
      return {
        content,
        finishReason: "stop" as FinishReason,
        usage: usage as any,
      }
    }

    const [finishReason, usage] = await Promise.all([
      result.finishReason,
      result.usage,
    ])
    trackProviderUsage({
      provider: this.providerId,
      model: this.modelName,
      usage,
    })
    return { content: fullResponse, finishReason, usage }
  }

  private async streamNativeTools(opts: {
    system: string
    messages: ModelMessage[]
    args: SendMessageArgs
    abortSignal: AbortSignal
    markActivity: () => void
    maxSteps: number
  }): Promise<SendMessageResult> {
    const seenStepResults: Array<{ toolName: string; result: string }> = []
    const deniedCounts = new Map<string, number>()
    let stopForDenialLoop = false
    const toolCallHistory: Array<{ toolName: string; argsKey: string }> = []
    let stopForRepetition = false

    const extra = {
      ...this.maxOutputTokensOpts(),
      ...(this.opts.streamOptions?.(this.modelName) ?? {}),
    }

    const result = streamText({
      model: this.model,
      messages: opts.messages,
      system: opts.system || undefined,
      tools: opts.args.tools as any,
      stopWhen: stepCountIs(opts.maxSteps),
      abortSignal: opts.abortSignal,
      ...extra,
      prepareStep: async ({ messages }) => {
        if (stopForRepetition) {
          return {
            messages: [
              ...messages,
              {
                role: "system" as const,
                content:
                  "SYSTEM NOTICE: You have called the same tools with the same arguments " +
                  "multiple times without making progress. Stop repeating yourself. " +
                  "Analyze what you already have and respond to the user.",
              },
            ],
          }
        }
        if (stopForDenialLoop) {
          return {
            messages: [
              ...messages,
              {
                role: "system" as const,
                content:
                  "SYSTEM NOTICE: You have called the same permission-protected tool multiple " +
                  "times after the user denied it. Stop calling it. Respond to the user with " +
                  "what you have so far and ask for guidance.",
              },
            ],
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
                "SYSTEM NOTICE: All tool calls so far have returned empty or error results. " +
                "You have NO source material to answer with. Do NOT invent specifications, pricing, " +
                "dates, leaderboard rankings, or any factual claims. Tell the user which tools failed " +
                "and what you would need to proceed.\n\nTool outcomes:\n" +
                summary,
            },
          ],
        }
      },
      onStepFinish: async (event) => {
        if (event.toolCalls?.length) {
          for (const tc of event.toolCalls) {
            opts.args.onToolCall?.({
              toolName: tc.toolName,
              args: (tc as any).input as Record<string, unknown>,
            })
          }
        }
        const inputByCallId = new Map<string, unknown>()
        if (event.toolCalls?.length) {
          for (const tc of event.toolCalls) {
            const id = (tc as any).toolCallId
            if (typeof id === "string") {
              inputByCallId.set(id, (tc as any).input)
            }
          }
        }
        const toolResults = (event as any).toolResults as
          | Array<{ toolName?: string; toolCallId?: string; input?: unknown; output?: unknown }>
          | undefined
        seenStepResults.length = 0
        if (toolResults?.length) {
          for (const tr of toolResults) {
            const name = tcName(tr.toolName) ?? "unknown"
            const out = (tr as any).output
            const text =
              typeof out === "string"
                ? out
                : out === undefined || out === null
                  ? ""
                  : JSON.stringify(out)
            seenStepResults.push({ toolName: name, result: text })
            const a =
              tr.input ?? (tr.toolCallId ? inputByCallId.get(tr.toolCallId) : undefined)
            opts.args.onToolResult?.({ toolName: name, args: a, result: text })
            if (isDeniedToolResult(text)) {
              const prev = deniedCounts.get(name) ?? 0
              const next = prev + 1
              deniedCounts.set(name, next)
              if (next >= 2) stopForDenialLoop = true
            } else {
              deniedCounts.set(name, 0)
            }
          }
        }
        if (event.toolCalls?.length) {
          for (const tc of event.toolCalls) {
            const a = (tc as any).input ?? {}
            const argsKey = JSON.stringify(a, Object.keys(a).sort())
            toolCallHistory.push({ toolName: tc.toolName, argsKey })
            let count = 0
            for (const h of toolCallHistory) {
              if (h.toolName === tc.toolName && h.argsKey === argsKey) count++
            }
            if (count >= 3) {
              stopForRepetition = true
              break
            }
          }
          if (toolCallHistory.length > 12) {
            toolCallHistory.splice(0, toolCallHistory.length - 12)
          }
        }
        if (opts.args.onStepFinish && event.toolCalls?.length) {
          opts.args.onStepFinish({
            stepNumber: (event as any).stepNumber ?? 0,
            toolCalls: (event.toolCalls ?? []).map((tc) => ({
              toolName: tc.toolName,
              args: (tc as any).input,
            })),
            toolResults: seenStepResults.map((r) => ({
              toolName: r.toolName,
              args: {},
              result: r.result,
            })),
          })
        }
      },
    })

    let fullResponse = ""
    let sawToolEvents = false

    if (this.opts.useFullStream) {
      for await (const event of result.fullStream) {
        opts.markActivity()
        if (event.type === "text-delta") {
          if (event.text == null) continue
          fullResponse += event.text
          opts.args.onChunk?.(event.text)
        } else if (event.type === "reasoning-delta") {
          if (event.text) opts.args.onReasoning?.(event.text)
        } else if (event.type === "tool-call" || event.type === "tool-result") {
          sawToolEvents = true
        }
      }
    } else {
      for await (const chunk of result.textStream) {
        opts.markActivity()
        fullResponse += chunk
        opts.args.onChunk?.(chunk)
      }
    }

    if (
      !fullResponse.trim() &&
      !sawToolEvents &&
      this.opts.emptyStreamFallback
    ) {
      const fb = await this.opts.emptyStreamFallback({
        modelName: this.modelName,
        system: opts.system,
        messages: opts.messages,
        tools: opts.args.tools,
      })
      const content = fb?.content ?? ""
      if (content) opts.args.onChunk?.(content)
      const inputTokens = fb?.usage?.prompt_tokens ?? 0
      const outputTokens = fb?.usage?.completion_tokens ?? 0
      const usage = {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        inputTokenDetails: {
          noCacheTokens: undefined as number | undefined,
          cacheReadTokens: 0,
          cacheWriteTokens: undefined as number | undefined,
        },
        outputTokenDetails: {
          textTokens: undefined as number | undefined,
          reasoningTokens: undefined as number | undefined,
        },
      }
      trackProviderUsage({
        provider: this.providerId,
        model: this.modelName,
        usage,
      })
      return {
        content,
        finishReason: "stop" as FinishReason,
        usage: usage as any,
      }
    }

    const [finishReason, usage] = await Promise.all([
      result.finishReason,
      result.usage,
    ])
    trackProviderUsage({
      provider: this.providerId,
      model: this.modelName,
      usage,
    })
    return { content: fullResponse, finishReason, usage }
  }

  async getMessage(messages: ModelMessage[], tools?: any): Promise<string> {
    const result = await this.sendMessage({ messages, tools })
    return result.content
  }
}

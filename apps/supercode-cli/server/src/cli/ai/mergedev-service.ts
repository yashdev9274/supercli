import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { streamText, stepCountIs, type ModelMessage, type LanguageModel, type LanguageModelUsage } from "ai"
import chalk from "chalk"
import { mergedevConfig } from "../../config/mergedev.config.ts"
import { recordUsage } from "../../lib/track-usage"
import { computeCost } from "../../lib/pricing"
import { isEmptyToolResult, isDeniedToolResult, summarizeToolResult, tcName } from "./tool-result"

const HIGH_VALUE_MODELS = ["anthropic/claude-fable-5", "anthropic/claude-opus-4-8", "anthropic/claude-opus-4-7", "openai/gpt-5.5"]

export class MergeDevService {
  model: LanguageModel
  readonly modelName: string

  constructor(modelName?: string) {
    if (!mergedevConfig.apiKey) {
      throw new Error(
        "Merge Dev is not configured.\n\n  Set MERGE_DEV_API_KEY in your environment:\n" +
        "    export MERGE_DEV_API_KEY=<your-key>\n\n" +
        "  Get a key at: https://app.merge.dev/settings/api-keys",
      )
    }

    this.modelName = modelName || mergedevConfig.model

    const client = createOpenAICompatible({
      name: "mergedev",
      baseURL: mergedevConfig.baseUrl,
      headers: { Authorization: `Bearer ${mergedevConfig.apiKey}` },
    })

    this.model = client.chatModel(this.modelName)
  }

  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
    onToolResult?: (params: { toolName: string; args: unknown; result: string }) => void,
    onStepFinish?: (params: { stepNumber: number; toolCalls: Array<{ toolName: string; args: unknown }>; toolResults: Array<{ toolName: string; args: unknown; result: string }> }) => void,
  ) {
    const streamAbortController = new AbortController()
    const streamTimeout = setTimeout(() => streamAbortController.abort(), 120_000)
    const signalHandler = signal ? () => streamAbortController.abort() : undefined
    signalHandler && signal!.addEventListener("abort", signalHandler, { once: true })

    try {
      const systemMessages = messages.filter(m => m.role === "system")
      const nonSystemMessages = messages.filter(m => m.role !== "system")
      const system = systemMessages.map(m => m.content).join("\n")

      const hasTools = tools && Object.keys(tools).length > 0

      if (!hasTools) {
        const result = streamText({
          model: this.model,
          messages: nonSystemMessages,
          system,
          abortSignal: streamAbortController.signal,
          ...(!HIGH_VALUE_MODELS.includes(this.modelName) ? { maxOutputTokens: 8192 } : {}),
        })

        let fullResponse = ""
        for await (const chunk of result.textStream) {
          fullResponse += chunk
          onChunk?.(chunk)
        }

        const [finishReason, usage] = await Promise.all([
          result.finishReason,
          result.usage,
        ])

        recordUsage({
          provider: "mergedev",
          model: this.modelName,
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
          costUsd: computeCost(this.modelName, usage.inputTokens ?? 0, usage.outputTokens ?? 0, usage.inputTokenDetails?.cacheReadTokens ?? 0),
          durationMs: null,
        })

        return {
          content: fullResponse,
          finishReason,
          usage,
        }
      }

      let fullResponse = ""
      const seenStepResults: Array<{ toolName: string; result: string }> = []
      const deniedCounts = new Map<string, number>()
      let stopForDenialLoop = false
      const toolCallHistory: Array<{ toolName: string; argsKey: string }> = []
      let stopForRepetition = false

      const result = streamText({
        model: this.model,
        messages: nonSystemMessages,
        system,
        tools,
        ...(!HIGH_VALUE_MODELS.includes(this.modelName) ? { maxOutputTokens: 8192 } : {} as Record<string, never>),
        stopWhen: stepCountIs(8),
        abortSignal: streamAbortController.signal,
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
                  "and what you would need to proceed.\n\nTool outcomes:\n" + summary,
              },
            ],
          }
        },
        onStepFinish: async (event) => {
          if (event.toolCalls?.length) {
            for (const tc of event.toolCalls) {
              onToolCall?.({ toolName: tc.toolName, args: (tc as any).input as Record<string, unknown> })
              // Tool call repetition guard: same tool + same args 3+ times → stop.
              const args = (tc as any).input ?? {}
              const argsKey = JSON.stringify(args, Object.keys(args).sort())
              toolCallHistory.push({ toolName: tc.toolName, argsKey })
              let repCount = 0
              for (const h of toolCallHistory) {
                if (h.toolName === tc.toolName && h.argsKey === argsKey) repCount++
              }
              if (repCount >= 3) stopForRepetition = true
              if (toolCallHistory.length > 12) {
                toolCallHistory.splice(0, toolCallHistory.length - 12)
              }
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
              const args = tr.input ?? (tr.toolCallId ? inputByCallId.get(tr.toolCallId) : undefined)
              if (onToolResult) {
                onToolResult({ toolName: name, args, result: text })
              }
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
        },
      })

      for await (const chunk of result.textStream) {
        fullResponse += chunk
        onChunk?.(chunk)
      }

      const [finishReason, usage] = await Promise.all([
        result.finishReason,
        result.usage,
      ])

      recordUsage({
        provider: "mergedev",
        model: this.modelName,
        inputTokens: usage.inputTokens ?? 0,
        outputTokens: usage.outputTokens ?? 0,
        cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
        totalTokens: usage.totalTokens ?? 0,
        costUsd: computeCost(this.modelName, usage.inputTokens ?? 0, usage.outputTokens ?? 0, usage.inputTokenDetails?.cacheReadTokens ?? 0),
        durationMs: null,
      })

      return {
        content: fullResponse,
        finishReason,
        usage,
      }
    } catch (error: any) {
      if (error?.name === "AbortError") throw error
      const msg = error instanceof Error ? error.message : String(error)
      const is5xx = /MergeDev (?:API )?5\d\d/.test(msg) || /status code 5\d\d/i.test(msg)
      if (is5xx) {
        const friendly = new Error(
          `Merge Dev Gateway error (HTTP 5xx). This is upstream — not your request. ` +
          `Try again, or run /model to switch providers.\n  ${msg}`,
        )
        console.error(chalk.red("MergeDev Service Error:"), friendly.message)
        throw friendly
      }
      console.error(chalk.red("MergeDev Service Error:"), msg)
      throw error
    } finally {
      clearTimeout(streamTimeout)
      if (signalHandler) signal!.removeEventListener("abort", signalHandler as any)
    }
  }

  async getMessage(messages: ModelMessage[], tools?: any) {
    let fullResponse = ""
    const result = await this.sendMessage(messages, (chunk) => {
      fullResponse += chunk
    })
    return result.content
  }
}

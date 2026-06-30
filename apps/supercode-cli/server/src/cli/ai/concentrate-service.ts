import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { streamText, stepCountIs, type ModelMessage, type LanguageModel } from "ai"
import chalk from "chalk"
import { recordUsage } from "../../lib/track-usage"
import { computeCost } from "../../lib/pricing"
import { isEmptyToolResult, isDeniedToolResult, summarizeToolResult, tcName } from "./tool-result"

const CONCENTRATE_API_KEY = process.env.CONCENTRATEAI_API_KEY || ""
const BASE_URL = "https://api.concentrate.ai/v1"

interface NonStreamingResponse {
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

async function nonStreamingRequest(modelName: string, system: string, messages: Array<{ role: string; content: string }>): Promise<NonStreamingResponse> {
  const body = {
    model: modelName,
    messages: system ? [{ role: "system", content: system }, ...messages] : messages,
    max_tokens: 4096,
    temperature: 0.7,
    stream: false,
  }
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CONCENTRATE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => "unknown error")
    throw new Error(`ConcentrateAI API ${res.status}: ${errText}`)
  }
  return await res.json() as NonStreamingResponse
}

export class ConcentrateService {
  model: LanguageModel
  readonly modelName: string

  constructor(modelName?: string) {
    if (!CONCENTRATE_API_KEY) {
      throw new Error("ConcentrateAI is not configured.\n\n  Set CONCENTRATEAI_API_KEY in your environment:\n    export CONCENTRATEAI_API_KEY=<your-key>\n\n  Get a key at: https://concentrate.ai")
    }

    this.modelName = modelName || "deepseek-v4-flash"

    const concentrate = createOpenAICompatible({
      name: "concentrate",
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${CONCENTRATE_API_KEY}`,
      },
    })

    this.model = concentrate.chatModel(this.modelName)
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
    try {
      const systemMessages = messages.filter(m => m.role === "system")
      const nonSystemMessages = messages.filter(m => m.role !== "system")
      const system = systemMessages.map(m => m.content).join("\n")

      const hasTools = tools && Object.keys(tools).length > 0

      // console.error(`[d] tools=${hasTools} count=${nonSystemMessages.length} keys=${hasTools ? Object.keys(tools).length : 0}`)

      if (!hasTools) {
        const result = streamText({
          model: this.model,
          messages: nonSystemMessages,
          system,
          abortSignal: signal,
        })

        let fullResponse = ""
        let chunkCount = 0
        for await (const chunk of result.textStream) {
          chunkCount++
          fullResponse += chunk
          onChunk?.(chunk)
        }
        // console.error(`[d] non-tools streamed ${chunkCount} chunks resp="${fullResponse}"`)

        if (!fullResponse.trim()) {
          const nonStreamData = await nonStreamingRequest(this.modelName, system, nonSystemMessages.map((m: any) => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) })))
          const content = nonStreamData?.choices?.[0]?.message?.content ?? ""
          if (content) {
            onChunk?.(content)
          }
          const inputTokens = nonStreamData?.usage?.prompt_tokens ?? 0
          const outputTokens = nonStreamData?.usage?.completion_tokens ?? 0
          recordUsage({
            provider: "concentrateai",
            model: this.modelName,
            inputTokens,
            outputTokens,
            cachedInputTokens: 0,
            totalTokens: inputTokens + outputTokens,
            costUsd: computeCost(this.modelName, inputTokens, outputTokens, 0),
            durationMs: null,
          })
          return {
            content,
            finishReason: "stop" as const,
            usage: {
              inputTokens,
              outputTokens,
              totalTokens: inputTokens + outputTokens,
              inputTokenDetails: {
                noCacheTokens: undefined,
                cacheReadTokens: 0,
                cacheWriteTokens: undefined,
              },
              outputTokenDetails: {
                textTokens: undefined,
                reasoningTokens: undefined,
              },
            },
          }
        }

        const [finishReason, usage] = await Promise.all([
          result.finishReason,
          result.usage,
        ])

        recordUsage({
          provider: "concentrateai",
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

      // console.error(`[d] tools path hit`)

      let fullResponse = ""

      // Track per-step tool results so we can inject a sentinel when every
      // tool returns empty. Used to prevent the "invent after empty fetch"
      // hallucination loop.
      const seenStepResults: Array<{ toolName: string; result: string }> = []
      // Track consecutive denials of the same tool — stop the model looping
      // on a permission prompt the user already answered.
      const deniedCounts = new Map<string, number>()
      let stopForDenialLoop = false

      const result = streamText({
        model: this.model,
        messages: nonSystemMessages,
        system,
        tools,
        stopWhen: stepCountIs(8),
        abortSignal: signal,
        prepareStep: async ({ messages }) => {
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
            }
          }
          const toolResults = (event as any).toolResults as
            | Array<{ toolName?: string; input?: unknown; output?: unknown }>
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
              if (onToolResult) {
                onToolResult({ toolName: name, args: tr.input, result: text })
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

      let toolChunkCount = 0
      for await (const chunk of result.textStream) {
        toolChunkCount++
        fullResponse += chunk
        onChunk?.(chunk)
      }
      // console.error(`[d] tools streamed ${toolChunkCount} chunks resp="${fullResponse}"`)

      // Same empty-stream fallback as non-tools path — ConcentrateAI's
      // Novita proxy intermittently drops content on streaming requests.
      if (!fullResponse.trim()) {
        const nonStreamData = await nonStreamingRequest(this.modelName, system, nonSystemMessages.map((m: any) => ({ role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) })))
        const content = nonStreamData?.choices?.[0]?.message?.content ?? ""
        if (content) {
          onChunk?.(content)
        }
        const inputTokens = nonStreamData?.usage?.prompt_tokens ?? 0
        const outputTokens = nonStreamData?.usage?.completion_tokens ?? 0
        recordUsage({
          provider: "concentrateai",
          model: this.modelName,
          inputTokens,
          outputTokens,
          cachedInputTokens: 0,
          totalTokens: inputTokens + outputTokens,
          costUsd: computeCost(this.modelName, inputTokens, outputTokens, 0),
          durationMs: null,
        })
        return {
          content,
          finishReason: "stop" as const,
          usage: {
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            inputTokenDetails: {
              noCacheTokens: undefined,
              cacheReadTokens: 0,
              cacheWriteTokens: undefined,
            },
            outputTokenDetails: {
              textTokens: undefined,
              reasoningTokens: undefined,
            },
          },
        }
      }

      const [finishReason, usage] = await Promise.all([
        result.finishReason,
        result.usage,
      ])

      recordUsage({
        provider: "concentrateai",
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
      console.error(chalk.red("ConcentrateAI Service Error:"), error instanceof Error ? error.message : String(error))
      throw error
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

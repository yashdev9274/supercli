import { createGoogleGenerativeAI } from "@ai-sdk/google"
import {
  streamText,
  generateObject,
  stepCountIs,
  type ModelMessage,
} from "ai"
import chalk from "chalk"
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
  drainReasoningStream,
} from "./stream-helpers"
import type { SendMessageArgs, SendMessageResult } from "./types"

export class GoogleAdapter {
  model: ReturnType<ReturnType<typeof createGoogleGenerativeAI>>
  readonly modelName: string
  readonly providerId = "google"

  constructor(modelName?: string, apiKey?: string, defaultModel?: string) {
    const key =
      apiKey ||
      process.env.GOOGLE_BYOK_PROD_KEY ||
      process.env.GOOGLE_BYOK_DEV_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      ""
    if (!key) {
      throw new Error(
        "Google Gemini is not configured.\n\n  Set GOOGLE_GENERATIVE_AI_API_KEY in your environment:\n    export GOOGLE_GENERATIVE_AI_API_KEY=<your-key>\n\n  Get a key at: https://aistudio.google.com/apikey",
      )
    }
    this.modelName = modelName || defaultModel || "gemini-2.5-flash"
    const google = createGoogleGenerativeAI({ apiKey: key })
    this.model = google(this.modelName)
  }

  async generateStructured(schema: any, prompt: string): Promise<any> {
    try {
      const result = await generateObject({
        model: this.model,
        schema,
        prompt,
      })
      return result.object
    } catch (error) {
      console.error(
        chalk.red("AI Structured Generation Error:"),
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }
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
        }
      : messagesOrArgs

    try {
      const { system, messages } = prepareMessages(args.messages)
      const toolsPresent = hasTools(args.tools)

      if (!toolsPresent) {
        const result = streamText({
          model: this.model,
          messages,
          system: system || undefined,
          abortSignal: args.signal,
        })

        let fullResponse = ""
        await Promise.all([
          drainReasoningStream(result, args.onReasoning),
          (async () => {
            for await (const chunk of result.textStream) {
              fullResponse += chunk
              args.onChunk?.(chunk)
            }
          })(),
        ])

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

      const seenStepResults: Array<{ toolName: string; result: string }> = []
      const deniedCounts = new Map<string, number>()
      let stopForDenialLoop = false
      const toolCallHistory: Array<{ toolName: string; argsKey: string }> = []
      let stopForRepetition = false

      const result = streamText({
        model: this.model,
        messages,
        system: system || undefined,
        tools: args.tools as any,
        stopWhen: stepCountIs(8),
        abortSignal: args.signal,
        prepareStep: async ({ messages: stepMessages }) => {
          if (stopForRepetition) {
            return {
              messages: [
                ...stepMessages,
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
                ...stepMessages,
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
              ...stepMessages,
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
              args.onToolCall?.({
                toolName: tc.toolName,
                args: (tc as any).input as Record<string, unknown>,
              })
              const a = (tc as any).input ?? {}
              const argsKey = JSON.stringify(a, Object.keys(a).sort())
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
              args.onToolResult?.({ toolName: name, args: tr.input, result: text })
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

      let fullResponse = ""
      for await (const chunk of result.textStream) {
        fullResponse += chunk
        args.onChunk?.(chunk)
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
    } catch (error: any) {
      if (error?.name === "AbortError") throw error
      console.error(
        chalk.red("AI Service Error:"),
        error instanceof Error ? error.message : String(error),
      )
      throw error
    }
  }

  async getMessage(messages: ModelMessage[], tools?: any): Promise<string> {
    const result = await this.sendMessage({ messages, tools })
    return result.content
  }
}

import { openRouterConfig } from "../../config/openrouter.config.ts"
import chalk from "chalk"
import type { FinishReason, LanguageModelUsage } from "ai"
import { recordUsage } from "../../lib/track-usage"
import { computeCost } from "../../lib/pricing"
import { isEmptyToolResult, isDeniedToolResult, summarizeToolResult } from "./tool-result"

const MODEL_MAX_TOKENS: Record<string, number> = {
  "moonshotai/kimi-k2.6": 256,
  "deepseek/deepseek-v4-flash": 4096,
  "deepseek-ai/deepseek-v4-flash": 4096,
  "minimax/minimax-m3": 1024,
  "minimax/minimax-m3.5": 1024,
  "minimax/minimax-m2.5": 1024,
  "minimaxai/minimax-m3": 1024,
  "z-ai/glm-5.1": 256,
}

function getModelMaxTokens(modelName: string): number {
  const direct = MODEL_MAX_TOKENS[modelName]
  if (direct != null) return direct
  for (const [key, value] of Object.entries(MODEL_MAX_TOKENS)) {
    if (modelName.includes(key) || key.includes(modelName)) return value
  }
  for (const key of Object.keys(MODEL_MAX_TOKENS)) {
    const keyParts = key.split("/").pop()
    if (keyParts && modelName.includes(keyParts)) {
      const val = MODEL_MAX_TOKENS[key]
      if (val != null) return val
    }
  }
  return Math.min(openRouterConfig.maxTokens, 8192)
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputTokenDetails?: { noCacheTokens: number; cacheReadTokens: number; cacheWriteTokens: number }
  outputTokenDetails?: { textTokens: number; reasoningTokens: number }
}

export class OpenRouterService {
  readonly modelName: string
  readonly maxTokens: number

  constructor(modelName?: string) {
    if (!openRouterConfig.apiKey) {
      throw new Error("OpenRouter is not configured.\n\n  Set OPENROUTER_API_KEY in your environment:\n    export OPENROUTER_API_KEY=<your-key>\n\n  Get a key at: https://openrouter.ai/keys")
    }

    this.modelName = modelName || openRouterConfig.model
    this.maxTokens = getModelMaxTokens(this.modelName)
  }

  private async request(
    messages: any[],
    tools?: any,
    onChunk?: (chunk: string) => void,
    onToolCall?: any,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
  ): Promise<{
    content: string
    finishReason: FinishReason
    usage: LanguageModelUsage
    toolCalls: Array<{ toolName: string; args: Record<string, unknown>; toolCallId: string }>
  }> {
    const systemMessages = messages.filter((m: any) => m.role === "system")
    const nonSystemMessages = messages.filter((m: any) => m.role !== "system")
    const system = systemMessages.map((m: any) => m.content).join("\n")

    const bodyObj: any = {
      model: this.modelName,
      messages: nonSystemMessages.map((m: any) => {
        const msg: any = {
          role: m.role,
          content: m.content !== null && m.content !== undefined ? String(m.content) : "",
        }
        if (m.tool_calls) msg.tool_calls = m.tool_calls
        if (m.tool_call_id) msg.tool_call_id = m.tool_call_id
        return msg
      }),
      max_tokens: this.maxTokens,
      temperature: 0.7,
      stream: true,
    }
    if (system && nonSystemMessages.length > 0) {
      bodyObj.messages = [{ role: "system", content: system }, ...bodyObj.messages]
    }
    if (tools && Object.keys(tools).length > 0) {
      bodyObj.tools = Object.entries(tools).map(([name, fn]: [string, any]) => {
        // AI SDK 6 tools expose `inputSchema`; legacy `parameters` is kept
        // as a fallback so tools that haven't been wrapped still serialize.
        const schema = fn.inputSchema ?? fn.parameters ?? {}
        return {
          type: "function",
          function: { name, description: fn.description || "", parameters: schema },
        }
      })
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openRouterConfig.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(bodyObj),
      signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => "unknown error")
      throw new Error(`OpenRouter API ${res.status}: ${errText}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""
    let fullResponse = ""
    let inputTokens = 0
    let outputTokens = 0
    let finishReason: FinishReason = "stop"
    const toolCalls: Array<{ toolName: string; args: Record<string, unknown>; toolCallId: string }> = []
    const pendingToolCalls: Record<number, { id: string; name: string; args: string }> = {}

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith("data: ")) continue
        const jsonStr = trimmed.slice(6)
        if (jsonStr === "[DONE]") continue
        try {
          const data = JSON.parse(jsonStr)
          const delta = data.choices?.[0]?.delta
          if (delta?.content) {
            fullResponse += delta.content
            onChunk?.(delta.content)
          }
          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const index = tc.index ?? 0
              if (!pendingToolCalls[index]) {
                pendingToolCalls[index] = { id: "", name: "", args: "" }
              }
              if (tc.id) pendingToolCalls[index].id = tc.id
              if (tc.function?.name) pendingToolCalls[index].name = tc.function.name
              if (tc.function?.arguments) pendingToolCalls[index].args += tc.function.arguments
            }
          }
          if (data.choices?.[0]?.finish_reason === "tool_calls") {
            for (const [, call] of Object.entries(pendingToolCalls)) {
              if (call.name && call.args) {
                try {
                  const parsed = JSON.parse(call.args)
                  toolCalls.push({ toolName: call.name, args: parsed, toolCallId: call.id })
                  onToolCall?.({ toolName: call.name, args: parsed })
                } catch { /* skip malformed args */ }
              }
            }
            for (const k of Object.keys(pendingToolCalls)) {
              const n = Number(k)
              if (!isNaN(n)) delete pendingToolCalls[n]
            }
          }
          if (data.choices?.[0]?.finish_reason) {
            finishReason = data.choices[0].finish_reason
          }
          if (data.usage) {
            inputTokens = data.usage.prompt_tokens ?? 0
            outputTokens = data.usage.completion_tokens ?? 0
          }
        } catch { /* skip malformed */ }
      }
    }

    return {
      content: fullResponse,
      finishReason,
      usage: {
        inputTokens,
        outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 },
        outputTokens,
        inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        totalTokens: inputTokens + outputTokens,
      },
      toolCalls,
    }
  }

  async sendMessage(
    messages: any[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: any,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
    onToolResult?: (params: { toolName: string; args: unknown; result: string }) => void,
    onStepFinish?: (params: { stepNumber: number; toolCalls: Array<{ toolName: string; args: unknown }>; toolResults: Array<{ toolName: string; args: unknown; result: string }> }) => void,
  ) {
    let currentMessages = [...messages]
    let accumulatedContent = ""
    let finishReason: FinishReason = "stop"
    let usage: LanguageModelUsage = {
      inputTokens: 0,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokens: 0,
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
      totalTokens: 0,
    }

    const TOOL_BUDGET = 8
    let toolCallsThisTurn = 0
    // Track every tool result so we can detect the "all empty" case and inject
    // a system message forcing the model to stop inventing content.
    const allToolResults: Array<{ toolName: string; result: string }> = []
    const deniedCounts = new Map<string, number>()

    while (true) {
      // Permission-denial loop guard
      let stopForDenialLoop = false
      for (const [name, count] of deniedCounts.entries()) {
        if (count >= 2) {
          stopForDenialLoop = true
          break
        }
      }
      if (stopForDenialLoop) {
        currentMessages.push({
          role: "system",
          content:
            "SYSTEM NOTICE: You have called the same permission-protected tool multiple " +
            "times after the user denied it. Stop calling it. Respond to the user with " +
            "what you have so far and ask for guidance.",
        })
        break
      }

      // If every tool result so far was empty AND the model just emitted
      // another tool call, inject a sentinel message before continuing.
      if (toolCallsThisTurn > 0 && allToolResults.length > 0) {
        const allEmpty = allToolResults.every((r) => isEmptyToolResult(r.result))
        if (allEmpty) {
          const summary = allToolResults
            .map((r) => `- ${r.toolName}: ${summarizeToolResult(r.result)}`)
            .join("\n")
          currentMessages.push({
            role: "system",
            content:
              "SYSTEM NOTICE: All tool calls so far have returned empty or error results. " +
              "You have NO source material to answer with. Do NOT invent specifications, pricing, " +
              "dates, leaderboard rankings, or any factual claims. Tell the user which tools failed " +
              "and what you would need to proceed.\n\nTool outcomes:\n" + summary,
          })
          // Stop the loop after one sentinel injection — the model should now respond.
          break
        }
      }

      if (toolCallsThisTurn >= TOOL_BUDGET) {
        currentMessages.push({
          role: "system",
          content: `Tool call budget (${TOOL_BUDGET}) reached. Stop calling tools and respond to the user with what you have so far.`,
        })
      }

      const result = await this.request(
        currentMessages, tools, onChunk, onToolCall, signal, onReasoning,
      )

      accumulatedContent += result.content
      finishReason = result.finishReason
      usage = result.usage

      if (result.toolCalls.length === 0) break

      for (const call of result.toolCalls) {
        const toolFn = tools?.[call.toolName]
        let toolResult: string

        if (toolFn?.execute) {
          try {
            toolResult = await toolFn.execute(call.args)
          } catch (err: any) {
            toolResult = JSON.stringify({ error: err.message || "Tool execution failed" })
          }
        } else {
          toolResult = JSON.stringify({ error: `Tool "${call.toolName}" is not available locally` })
        }

        allToolResults.push({ toolName: call.toolName, result: toolResult })
        if (onToolResult) {
          onToolResult({ toolName: call.toolName, args: call.args, result: toolResult })
        }
        if (isDeniedToolResult(toolResult)) {
          const prev = deniedCounts.get(call.toolName) ?? 0
          deniedCounts.set(call.toolName, prev + 1)
        } else {
          deniedCounts.set(call.toolName, 0)
        }

        currentMessages.push({
          role: "assistant",
          content: null,
          tool_calls: [
            { id: call.toolCallId, type: "function", function: { name: call.toolName, arguments: JSON.stringify(call.args) } },
          ],
        })
        currentMessages.push({
          role: "tool",
          tool_call_id: call.toolCallId,
          content: toolResult,
        })
        toolCallsThisTurn += result.toolCalls.length
      }

      // Notify chat loop of step finish (OpenRouter uses a manual polling
      // loop, so each iteration is a "step" for our purposes).
      if (onStepFinish && result.toolCalls.length > 0) {
        onStepFinish({
          stepNumber: toolCallsThisTurn,
          toolCalls: result.toolCalls.map((c: any) => ({ toolName: c.toolName, args: c.args })),
          toolResults: result.toolCalls.map((c: any) => {
            const tr = allToolResults.find((r) => r.toolName === c.toolName)
            return {
              toolName: c.toolName,
              args: c.args,
              result: tr?.result ?? "",
            }
          }),
        })
      }

      if (toolCallsThisTurn >= TOOL_BUDGET) break
    }

    recordUsage({
      provider: "openrouter",
      model: this.modelName,
      inputTokens: usage.inputTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
      cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
      costUsd: computeCost(this.modelName, usage.inputTokens ?? 0, usage.outputTokens ?? 0, usage.inputTokenDetails?.cacheReadTokens ?? 0),
      durationMs: null,
    })

    return {
      content: accumulatedContent,
      finishReason,
      usage,
    }
  }

  async getMessage(messages: any[], tools?: any) {
    let fullResponse = ""
    const result = await this.sendMessage(messages, (chunk) => {
      fullResponse += chunk
    })
    return result.content
  }
}

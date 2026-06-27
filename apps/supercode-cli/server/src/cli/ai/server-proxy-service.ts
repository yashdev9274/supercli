import { getStoredToken } from "src/lib/token"
import type { ModelMessage, FinishReason, LanguageModelUsage } from "ai"

const BASE_URL = process.env.SUPERCODE_SERVER_URL || "https://supercode-8w7e.onrender.com"

export class ServerProxyService {
  readonly modelName: string
  readonly providerName: string

  constructor(provider: string, model?: string) {
    this.providerName = provider
    this.modelName = model || "default"
  }

  private collectedToolCalls: Array<{ toolName: string; args: Record<string, unknown>; toolCallId: string }> = []

  private async request(
    messages: ModelMessage[],
    tools?: any,
    onChunk?: (chunk: string) => void,
    onToolCall?: (call: { toolName: string; args: Record<string, unknown> }) => void,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
  ): Promise<{
    content: string
    finishReason: FinishReason
    usage: LanguageModelUsage
    toolCalls: Array<{ toolName: string; args: Record<string, unknown>; toolCallId: string }>
  }> {
    const toolCalls: Array<{ toolName: string; args: Record<string, unknown>; toolCallId: string }> = []
    const token = await getStoredToken()
    if (!token?.access_token) {
      throw new Error("Not authenticated. Please login first.")
    }

    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify({
        messages,
        provider: this.providerName,
        model: this.modelName,
        tools,
      }),
      signal,
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || "AI proxy request failed")
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error("No response body")

    const decoder = new TextDecoder()
    let buffer = ""
    let fullResponse = ""
    let finishReason: FinishReason = "stop"
    let usage: LanguageModelUsage = {
      inputTokens: 0,
      inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokens: 0,
      outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
      totalTokens: 0,
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      buffer = lines.pop() || ""

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const event = JSON.parse(trimmed)
          switch (event.type) {
            case "text":
              fullResponse += event.content
              onChunk?.(event.content)
              break
            case "reasoning":
              onReasoning?.(event.content)
              break
            case "tool-call":
              toolCalls.push({
                toolName: event.toolName,
                args: event.args,
                toolCallId: event.toolCallId || `call_${Date.now()}_${toolCalls.length}`,
              })
              onToolCall?.({ toolName: event.toolName, args: event.args })
              break
            case "finish":
              finishReason = event.reason || "stop"
              if (event.usage) usage = event.usage
              break
          }
        } catch { /* skip malformed */ }
      }
    }

    return { content: fullResponse, finishReason, usage, toolCalls }
  }

  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: (call: { toolName: string; args: Record<string, unknown> }) => void,
    signal?: AbortSignal,
    onReasoning?: (chunk: string) => void,
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

    this.collectedToolCalls = []

    // Multi-turn loop: keep calling the server as long as the AI requests tool calls
    while (true) {
      const result = await this.request(currentMessages, tools, onChunk, onToolCall, signal, onReasoning)

      accumulatedContent += result.content
      finishReason = result.finishReason
      usage = result.usage

      if (result.toolCalls.length === 0) break

      // Execute each tool and build the continuation messages
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

        // Add the assistant's tool call request to the message history
        currentMessages.push({
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: call.toolCallId,
              type: "function",
              function: {
                name: call.toolName,
                arguments: JSON.stringify(call.args),
              },
            },
          ],
        } as any)

        // Add the tool execution result
        currentMessages.push({
          role: "tool",
          tool_call_id: call.toolCallId,
          content: toolResult,
        } as any)

        this.collectedToolCalls.push(call)
      }
    }

    return {
      content: accumulatedContent,
      finishReason,
      usage,
    }
  }

  async getMessage(messages: ModelMessage[]) {
    let fullResponse = ""
    await this.sendMessage(messages, (chunk) => {
      fullResponse += chunk
    })
    return fullResponse
  }

  async generateObject(schema: any, prompt: string) {
    const token = await getStoredToken()
    if (!token?.access_token) {
      throw new Error("Not authenticated. Please login first.")
    }

    const res = await fetch(`${BASE_URL}/api/ai/generate-object`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.access_token}`,
      },
      body: JSON.stringify({
        provider: this.providerName,
        model: this.modelName,
        schema,
        prompt,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || "AI proxy generate-object request failed")
    }

    return res.json() as Promise<{ object: unknown }>
  }
}

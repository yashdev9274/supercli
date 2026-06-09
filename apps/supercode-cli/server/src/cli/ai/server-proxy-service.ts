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

  async sendMessage(
    messages: ModelMessage[],
    onChunk?: (chunk: string) => void,
    tools?: any,
    onToolCall?: (call: { toolName: string; args: Record<string, unknown> }) => void,
    signal?: AbortSignal,
  ) {
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
            case "tool-call":
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

    return {
      content: fullResponse,
      finishResponse: Promise.resolve(finishReason),
      usage: Promise.resolve(usage),
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

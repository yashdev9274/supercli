import type { JSONValue, LanguageModelV2, LanguageModelV2CallOptions, LanguageModelV2Content, LanguageModelV2FinishReason, LanguageModelV2FunctionTool, LanguageModelV2Prompt, LanguageModelV2StreamPart, LanguageModelV2Usage } from "@ai-sdk/provider"
import type { GatewayModel } from "./base"
import { BaseGatewayProvider, type GatewayProviderOptions, type ModelInfo } from "./base"

const DEFAULT_BASE_URL = "https://supercode-8w7e.onrender.com"
const DEFAULT_MODEL = "deepseek-v4-flash"

export interface SupercodeCloudProviderOptions extends Omit<GatewayProviderOptions, "provider"> {}

export class SupercodeCloudProvider extends BaseGatewayProvider {
  constructor(options: SupercodeCloudProviderOptions = {}) {
    super({
      ...options,
      provider: "supercode-cloud",
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
      model: options.model ?? DEFAULT_MODEL,
    })
  }

  protected buildModel(modelName: string): GatewayModel {
    return new SupercodeCloudLanguageModel(this, modelName)
  }

  async listModels(): Promise<ModelInfo[]> {
    return [
      { id: "default", name: "Supercode default model", provider: "supercode-cloud" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", provider: "supercode-cloud" },
    ]
  }
}

export function createSupercodeCloudProvider(options?: SupercodeCloudProviderOptions): SupercodeCloudProvider {
  return new SupercodeCloudProvider(options)
}

interface SupercodeStreamEvent {
  type?: string
  content?: string
  toolName?: string
  args?: string | Record<string, unknown>
  toolCallId?: string
  message?: string
  reason?: string
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
}

class SupercodeCloudLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const
  readonly provider = "supercode-cloud"
  readonly modelId: string
  readonly supportedUrls = {}

  constructor(
    private readonly gateway: SupercodeCloudProvider,
    modelId: string,
  ) {
    this.modelId = modelId
  }

  private buildRequest(options: LanguageModelV2CallOptions, stream: boolean): Record<string, unknown> {
    const tools = options.tools
      ?.filter((t): t is LanguageModelV2FunctionTool => t.type === "function")
      .map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
        },
      }))
    return {
      messages: convertPrompt(options.prompt),
      provider: "supercode-cloud",
      model: this.modelId,
      stream,
      tools,
    }
  }

  async doGenerate(options: LanguageModelV2CallOptions): Promise<{
    content: LanguageModelV2Content[]
    finishReason: LanguageModelV2FinishReason
    usage: LanguageModelV2Usage
    providerMetadata: Record<string, Record<string, JSONValue>>
    request: { body: unknown }
    warnings: Array<{ type: "other"; message: string }>
  }> {
    const { signal, cleanup } = this.gateway.createAbortController(options.abortSignal)
    try {
      const body = this.buildRequest(options, false)
      const response = await this.gateway.fetchWithRetry(`${this.gateway.baseURL}/api/v1/gateway`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.gateway.headers },
        body: JSON.stringify(body),
        signal,
      })
      const data = (await response.json()) as {
        content?: string
        reasoning?: string
        toolCalls?: Array<{ toolName: string; args: unknown; toolCallId: string }>
        finishReason?: string
        usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number }
      }
      const content: LanguageModelV2Content[] = []
      if (data.reasoning) content.push({ type: "reasoning", text: data.reasoning })
      if (data.content) content.push({ type: "text", text: data.content })
      for (const call of data.toolCalls ?? []) {
        content.push({
          type: "tool-call",
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: JSON.stringify(call.args ?? {}),
        })
      }
      return {
        content,
        finishReason: (data.finishReason as LanguageModelV2FinishReason | undefined) ?? "stop",
        usage: {
          inputTokens: data.usage?.inputTokens,
          outputTokens: data.usage?.outputTokens,
          totalTokens: data.usage?.totalTokens,
        },
        providerMetadata: {},
        request: { body },
        warnings: [],
      }
    } catch (error) {
      throw this.gateway.normalizeError(error)
    } finally {
      cleanup()
    }
  }

  async doStream(options: LanguageModelV2CallOptions): Promise<{
    stream: ReadableStream<LanguageModelV2StreamPart>
    request: { body: unknown }
  }> {
    const { signal, cleanup } = this.gateway.createAbortController(options.abortSignal)
    const body = this.buildRequest(options, true)
    try {
      const response = await this.gateway.fetchWithRetry(`${this.gateway.baseURL}/api/v1/gateway`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...this.gateway.headers },
        body: JSON.stringify(body),
        signal,
      })
      if (!response.body) {
        throw new Error("supercode-cloud: empty response body")
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const stream = new ReadableStream<LanguageModelV2StreamPart>({
        async start(controller) {
          let buffer = ""
          let textId = randomId()
          let reasoningId = randomId()
          let textStarted = false
          let reasoningStarted = false
          let usage: LanguageModelV2Usage | undefined
          let finishReason: LanguageModelV2FinishReason | undefined

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split("\n")
              buffer = lines.pop() ?? ""
              for (const rawLine of lines) {
                const line = rawLine.trim()
                if (!line) continue
                let event: SupercodeStreamEvent
                try {
                  event = JSON.parse(line) as SupercodeStreamEvent
                } catch {
                  continue
                }
                switch (event.type) {
                  case "text":
                    if (!textStarted) {
                      textId = randomId()
                      controller.enqueue({ type: "text-start", id: textId })
                      textStarted = true
                    }
                    controller.enqueue({ type: "text-delta", id: textId, delta: event.content ?? "" })
                    break
                  case "reasoning":
                    if (!reasoningStarted) {
                      reasoningId = randomId()
                      controller.enqueue({ type: "reasoning-start", id: reasoningId })
                      reasoningStarted = true
                    }
                    controller.enqueue({ type: "reasoning-delta", id: reasoningId, delta: event.content ?? "" })
                    break
                  case "tool-call": {
                    const callId = event.toolCallId ?? randomId()
                    const input =
                      typeof event.args === "string" ? event.args : JSON.stringify(event.args ?? {})
                    controller.enqueue({ type: "tool-input-start", id: callId, toolName: event.toolName ?? "" })
                    controller.enqueue({ type: "tool-input-delta", id: callId, delta: input })
                    controller.enqueue({ type: "tool-input-end", id: callId })
                    controller.enqueue({
                      type: "tool-call",
                      toolCallId: callId,
                      toolName: event.toolName ?? "",
                      input,
                    })
                    break
                  }
                  case "error":
                    controller.error(new Error(event.message ?? "supercode-cloud stream error"))
                    return
                  case "finish":
                    usage = {
                      inputTokens: event.usage?.inputTokens,
                      outputTokens: event.usage?.outputTokens,
                      totalTokens: event.usage?.totalTokens,
                    }
                    finishReason = (event.reason as LanguageModelV2FinishReason | undefined) ?? "stop"
                    break
                }
              }
            }
            if (reasoningStarted) controller.enqueue({ type: "reasoning-end", id: reasoningId })
            if (textStarted) controller.enqueue({ type: "text-end", id: textId })
            controller.enqueue({
              type: "finish",
              usage: usage ?? { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined },
              finishReason: finishReason ?? "stop",
            })
            controller.close()
          } catch (error) {
            controller.error(error)
          }
        },
        async cancel() {
          await reader.cancel()
        },
      })
      return { stream, request: { body } }
    } catch (error) {
      cleanup()
      throw this.gateway.normalizeError(error)
    }
  }
}

function convertPrompt(prompt: LanguageModelV2Prompt): Array<Record<string, unknown>> {
  return prompt.map((message) => {
    switch (message.role) {
      case "system":
        return { role: "system", content: message.content }
      case "user":
        return { role: "user", content: convertParts(message.content) }
      case "assistant":
        return { role: "assistant", content: convertParts(message.content) }
      case "tool": {
        const result = message.content[0]
        const output = result && typeof result.output === "object" && result.output !== null && "value" in result.output
          ? String((result.output as { value: unknown }).value)
          : JSON.stringify(result?.output ?? "")
        return { role: "tool", tool_call_id: result?.toolCallId ?? "", content: output }
      }
    }
  })
}

function convertParts(parts: Array<{ type: string; text?: string; data?: unknown; mediaType?: string }>): unknown {
  const converted = parts.map((part) => {
    if (part.type === "text") return { type: "text", text: part.text ?? "" }
    if (part.type === "reasoning") return { type: "reasoning", text: part.text ?? "" }
    if (part.type === "file") return { type: "file", mediaType: part.mediaType, data: String(part.data) }
    return part
  })
  if (converted.length === 1) return converted[0]
  return converted
}

function randomId(): string {
  return `id_${Math.random().toString(36).slice(2, 10)}`
}

import type { JSONValue, LanguageModelV2, LanguageModelV2CallOptions, LanguageModelV2Content, LanguageModelV2FilePart, LanguageModelV2FinishReason, LanguageModelV2FunctionTool, LanguageModelV2Message, LanguageModelV2Prompt, LanguageModelV2ReasoningPart, LanguageModelV2StreamPart, LanguageModelV2TextPart, LanguageModelV2ToolCallPart, LanguageModelV2ToolChoice, LanguageModelV2ToolResultPart, LanguageModelV2Usage } from "@ai-sdk/provider"
import type { GatewayModel } from "./base"
import { ModelUnavailableError } from "../core/errors"
import { BaseGatewayProvider, type GatewayProviderOptions, type ModelInfo } from "./base"

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
const DEFAULT_MODEL = "moonshotai/kimi-k2.6"

export interface OpenRouterProviderOptions extends Omit<GatewayProviderOptions, "provider"> {
  siteUrl?: string
  siteTitle?: string
  forceProvider?: string
  providerPreference?: string[]
  autoSelect?: boolean
  allowFallbacks?: boolean
}

export class OpenRouterProvider extends BaseGatewayProvider {
  readonly siteUrl?: string
  readonly siteTitle?: string
  readonly forceProvider?: string
  readonly providerPreference?: string[]
  readonly autoSelect?: boolean
  readonly allowFallbacks: boolean

  constructor(options: OpenRouterProviderOptions = {}) {
    super({
      ...options,
      provider: "openrouter",
      apiKey: options.apiKey ?? "",
      baseURL: options.baseURL ?? DEFAULT_BASE_URL,
      model: options.model ?? DEFAULT_MODEL,
    })
    this.siteUrl = options.siteUrl
    this.siteTitle = options.siteTitle
    this.forceProvider = options.forceProvider
    this.providerPreference = options.providerPreference
    this.autoSelect = options.autoSelect
    this.allowFallbacks = options.allowFallbacks ?? true
  }

  protected buildModel(modelName: string): GatewayModel {
    return new OpenRouterLanguageModel(this, modelName)
  }

  async listModels(): Promise<ModelInfo[]> {
    const fallback: ModelInfo[] = [
      { id: "moonshotai/kimi-k2.6", name: "Kimi K2.6", provider: "openrouter" },
      { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", provider: "openrouter" },
      { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", provider: "openrouter" },
    ]
    try {
      const response = await this.fetchImpl(`${this.baseURL}/models`)
      if (!response.ok) return fallback
      const data = (await response.json()) as { data?: Array<{ id?: string; name?: string }> }
      const models = data.data
        ?.filter((m) => typeof m.id === "string")
        .map((m) => ({ id: m.id!, name: m.name, provider: "openrouter" as const }))
      return models && models.length > 0 ? models : fallback
    } catch {
      return fallback
    }
  }
}

export function createOpenRouterProvider(options?: OpenRouterProviderOptions): OpenRouterProvider {
  return new OpenRouterProvider(options)
}

interface OpenRouterChunk {
  id?: string
  model?: string
  choices?: Array<{
    index?: number
    delta?: {
      content?: string | null
      reasoning?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        type?: string
        function?: { name?: string; arguments?: string }
      }>
    }
    message?: {
      content?: string | null
      reasoning?: string | null
      tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }>
    }
    finish_reason?: string | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    prompt_tokens_details?: { cached_tokens?: number }
  }
}

class OpenRouterLanguageModel implements LanguageModelV2 {
  readonly specificationVersion = "v2" as const
  readonly provider = "openrouter"
  readonly modelId: string
  readonly supportedUrls = {}

  constructor(
    private readonly gateway: OpenRouterProvider,
    modelId: string,
  ) {
    this.modelId = modelId
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
      const body = buildOpenRouterBody(options, this.gateway, this.modelId, false)
      const response = await this.gateway.fetchWithRetry(`${this.gateway.baseURL}/chat/completions`, {
        method: "POST",
        headers: buildHeaders(this.gateway),
        body: JSON.stringify(body),
        signal,
      })
      const data = (await response.json()) as OpenRouterChunk
      const choice = data.choices?.[0]
      const message = choice?.message
      const content: LanguageModelV2Content[] = []
      if (message?.reasoning) {
        content.push({ type: "reasoning", text: message.reasoning })
      }
      if (message?.content) {
        content.push({ type: "text", text: message.content })
      }
      for (const call of message?.tool_calls ?? []) {
        if (!call.function?.name) continue
        content.push({
          type: "tool-call",
          toolCallId: call.id ?? `tc_${content.length}`,
          toolName: call.function.name,
          input: call.function.arguments ?? "{}",
        })
      }
      return {
        content,
        finishReason: mapFinishReason(choice?.finish_reason),
        usage: mapUsage(data.usage),
        providerMetadata: {
          openrouter: { id: data.id ?? null, model: data.model ?? null },
        },
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
    const body = buildOpenRouterBody(options, this.gateway, this.modelId, true)
    try {
      const response = await this.gateway.fetchWithRetry(`${this.gateway.baseURL}/chat/completions`, {
        method: "POST",
        headers: buildHeaders(this.gateway),
        body: JSON.stringify(body),
        signal,
      })
      if (!response.body) {
        throw new ModelUnavailableError("openrouter: empty response body")
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
          const toolCalls = new Map<number, { id: string; name: string; args: string }>()
          let responseId: string | undefined
          let responseModel: string | undefined
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
                if (!line.startsWith("data:")) continue
                const payload = line.slice(5).trim()
                if (payload === "[DONE]") continue
                let chunk: OpenRouterChunk
                try {
                  chunk = JSON.parse(payload) as OpenRouterChunk
                } catch {
                  continue
                }
                responseId = chunk.id ?? responseId
                responseModel = chunk.model ?? responseModel
                if (chunk.usage) usage = mapUsage(chunk.usage)
                const choice = chunk.choices?.[0]
                const delta = choice?.delta
                if (delta?.reasoning) {
                  if (!reasoningStarted) {
                    reasoningId = randomId()
                    controller.enqueue({ type: "reasoning-start", id: reasoningId })
                    reasoningStarted = true
                  }
                  controller.enqueue({ type: "reasoning-delta", id: reasoningId, delta: delta.reasoning })
                }
                if (delta?.content) {
                  if (!textStarted) {
                    textId = randomId()
                    controller.enqueue({ type: "text-start", id: textId })
                    textStarted = true
                  }
                  controller.enqueue({ type: "text-delta", id: textId, delta: delta.content })
                }
                for (const call of delta?.tool_calls ?? []) {
                  const index = call.index ?? toolCalls.size
                  const existing = toolCalls.get(index)
                  if (existing) {
                    if (call.function?.name) existing.name = call.function.name
                    if (call.function?.arguments) existing.args += call.function.arguments
                    if (call.id) existing.id = call.id
                  } else {
                    toolCalls.set(index, {
                      id: call.id ?? randomId(),
                      name: call.function?.name ?? "",
                      args: call.function?.arguments ?? "",
                    })
                  }
                }
                if (choice?.finish_reason) {
                  finishReason = mapFinishReason(choice.finish_reason)
                }
              }
            }
            if (buffer.trim()) {
              const payload = buffer.trim().replace(/^data:/, "").trim()
              if (payload && payload !== "[DONE]") {
                try {
                  const chunk = JSON.parse(payload) as OpenRouterChunk
                  if (chunk.usage) usage = mapUsage(chunk.usage)
                  if (chunk.choices?.[0]?.finish_reason) {
                    finishReason = mapFinishReason(chunk.choices[0].finish_reason)
                  }
                } catch {
                  // ignore trailing garbage
                }
              }
            }

            if (reasoningStarted) controller.enqueue({ type: "reasoning-end", id: reasoningId })
            for (const call of toolCalls.values()) {
              controller.enqueue({ type: "tool-input-start", id: call.id, toolName: call.name })
              controller.enqueue({ type: "tool-input-delta", id: call.id, delta: call.args })
              controller.enqueue({ type: "tool-input-end", id: call.id })
              controller.enqueue({
                type: "tool-call",
                toolCallId: call.id,
                toolName: call.name,
                input: call.args,
              })
            }
            if (textStarted) controller.enqueue({ type: "text-end", id: textId })
            controller.enqueue({
              type: "response-metadata",
              id: responseId,
              modelId: responseModel,
            })
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

function buildHeaders(gateway: OpenRouterProvider): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...gateway.headers,
  }
  if (gateway.apiKey) {
    headers.Authorization = `Bearer ${gateway.apiKey}`
  }
  if (gateway.siteUrl) headers["HTTP-Referer"] = gateway.siteUrl
  if (gateway.siteTitle) headers["X-Title"] = gateway.siteTitle
  return headers
}

function buildOpenRouterBody(
  options: LanguageModelV2CallOptions,
  gateway: OpenRouterProvider,
  modelId: string,
  stream: boolean,
): Record<string, unknown> {
  const providerOptions: Record<string, unknown> = {}
  if (gateway.forceProvider) {
    providerOptions.force = true
    providerOptions.order = [gateway.forceProvider]
  } else if (gateway.providerPreference && gateway.providerPreference.length > 0) {
    providerOptions.order = gateway.providerPreference
  }
  if (gateway.autoSelect) {
    providerOptions.sort = "throughput"
  }
  if (gateway.allowFallbacks === false) {
    providerOptions.allow_fallbacks = false
  }

  const body: Record<string, unknown> = {
    model: modelId,
    messages: convertPrompt(options.prompt),
    stream,
  }
  if (options.maxOutputTokens !== undefined) body.max_tokens = options.maxOutputTokens
  if (options.temperature !== undefined) body.temperature = options.temperature
  if (options.topP !== undefined) body.top_p = options.topP
  if (options.presencePenalty !== undefined) body.presence_penalty = options.presencePenalty
  if (options.frequencyPenalty !== undefined) body.frequency_penalty = options.frequencyPenalty
  if (options.stopSequences && options.stopSequences.length > 0) body.stop = options.stopSequences
  if (options.seed !== undefined) body.seed = options.seed

  const tools = options.tools?.filter((t): t is LanguageModelV2FunctionTool => t.type === "function")
  if (tools && tools.length > 0) {
    body.tools = tools.map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }))
  }
  if (options.toolChoice) body.tool_choice = convertToolChoice(options.toolChoice)

  if (options.responseFormat) {
    if (options.responseFormat.type === "json") {
      body.response_format = { type: "json_object" }
    }
  }

  if (Object.keys(providerOptions).length > 0) {
    body.provider = providerOptions
  }
  return body
}

function convertToolChoice(toolChoice: LanguageModelV2ToolChoice): unknown {
  switch (toolChoice.type) {
    case "auto":
      return "auto"
    case "none":
      return "none"
    case "required":
      return "required"
    case "tool":
      return { type: "function", function: { name: toolChoice.toolName } }
  }
}

function convertPrompt(prompt: LanguageModelV2Prompt): Array<Record<string, unknown>> {
  const messages: Array<Record<string, unknown>> = []
  for (const message of prompt) {
    messages.push(convertMessage(message))
  }
  return messages
}

function convertMessage(message: LanguageModelV2Message): Record<string, unknown> {
  switch (message.role) {
    case "system":
      return { role: "system", content: message.content }
    case "user": {
      const text = collectText(message.content)
      const files = message.content.filter((part) => part.type === "file")
      if (files.length === 0) {
        return { role: "user", content: text }
      }
      const parts: Array<Record<string, unknown>> = []
      if (text) parts.push({ type: "text", text })
      for (const file of files as Array<LanguageModelV2FilePart>) {
        parts.push(convertFilePart(file))
      }
      return { role: "user", content: parts }
    }
    case "assistant": {
      const text = collectText(message.content)
      const toolCalls = message.content
        .filter((part) => part.type === "tool-call")
        .map((part) => {
          const call = part as LanguageModelV2ToolCallPart
          const input = typeof call.input === "string" ? call.input : JSON.stringify(call.input ?? {})
          return {
            id: call.toolCallId,
            type: "function",
            function: { name: call.toolName, arguments: input },
          }
        })
      const converted: Record<string, unknown> = { role: "assistant", content: text }
      if (toolCalls.length > 0) converted.tool_calls = toolCalls
      return converted
    }
    case "tool": {
      const results = message.content as Array<LanguageModelV2ToolResultPart>
      const first = results[0]
      if (!first) return { role: "tool", tool_call_id: "", content: "" }
      const output = typeof first.output === "object" && first.output !== null && "value" in first.output
        ? String((first.output as { value: unknown }).value)
        : JSON.stringify(first.output)
      return {
        role: "tool",
        tool_call_id: first.toolCallId,
        content: output,
      }
    }
  }
}

type AssistantParts = Array<
  LanguageModelV2TextPart | LanguageModelV2FilePart | LanguageModelV2ReasoningPart | LanguageModelV2ToolCallPart | LanguageModelV2ToolResultPart
>

function collectText(parts: AssistantParts): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => (part as LanguageModelV2TextPart).text)
    .join("")
}

function convertFilePart(file: LanguageModelV2FilePart): Record<string, unknown> {
  const data = file.data
  const dataUrl =
    data instanceof Uint8Array
      ? `data:${file.mediaType};base64,${bufferToBase64(data)}`
      : typeof data === "string" && data.startsWith("data:")
        ? data
        : String(data)
  return { type: "image_url", image_url: { url: dataUrl } }
}

function bufferToBase64(data: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < data.length; i += chunkSize) {
    binary += String.fromCharCode(...data.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function mapFinishReason(reason: string | null | undefined): LanguageModelV2FinishReason {
  switch (reason) {
    case "stop":
      return "stop"
    case "length":
      return "length"
    case "content_filter":
      return "content-filter"
    case "tool_calls":
      return "tool-calls"
    case "error":
      return "error"
    default:
      return "unknown"
  }
}

function mapUsage(usage: OpenRouterChunk["usage"]): LanguageModelV2Usage {
  return {
    inputTokens: usage?.prompt_tokens,
    outputTokens: usage?.completion_tokens,
    totalTokens: usage?.total_tokens,
    cachedInputTokens: usage?.prompt_tokens_details?.cached_tokens,
  }
}

function randomId(): string {
  return `id_${Math.random().toString(36).slice(2, 10)}`
}

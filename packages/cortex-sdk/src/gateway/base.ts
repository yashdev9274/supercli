import { generateText, streamText, type FinishReason, type LanguageModel, type LanguageModelUsage, type ModelMessage, type ToolSet } from "ai"
import type { LanguageModelV2, LanguageModelV3 } from "@ai-sdk/provider"
import { AuthError, ConnectionError, ModelUnavailableError, SdkError } from "../core/errors"
import type { FetchLike, GatewayProvider } from "../core/types"

// Gateway adapters build models through both ai v4/v5 (v2 spec) and newer
// provider SDKs (v3 spec); the AI runtime normalizes either at call time.
export type GatewayModel = LanguageModel | LanguageModelV2 | LanguageModelV3

export interface ModelInfo {
  id: string
  name?: string
  provider?: GatewayProvider
}

export interface GatewayUsage {
  provider: GatewayProvider
  model: string
  inputTokens: number
  outputTokens: number
  cachedInputTokens: number
  totalTokens: number
  durationMs: number | null
}

export interface GatewayCost {
  provider: GatewayProvider
  model: string
  inputTokens: number
  outputTokens: number
  inputCostUsd: number
  outputCostUsd: number
  totalCostUsd: number
}

export interface GatewayProviderOptions {
  provider: GatewayProvider
  apiKey?: string
  baseURL?: string
  model?: string
  headers?: Record<string, string>
  fetch?: FetchLike
  timeoutMs?: number
  maxRetries?: number
  onUsage?: (usage: GatewayUsage) => void
  onCost?: (cost: GatewayCost) => void
}

const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_MAX_RETRIES = 3

interface HttpError extends Error {
  status: number
  statusText: string
  body: string
}

export abstract class BaseGatewayProvider {
  readonly provider: GatewayProvider
  readonly defaultModel: string
  readonly apiKey: string
  readonly baseURL: string
  readonly headers: Record<string, string>
  readonly timeoutMs: number
  readonly maxRetries: number

  protected readonly fetchImpl: typeof fetch
  protected readonly onUsage?: (usage: GatewayUsage) => void
  protected readonly onCost?: (cost: GatewayCost) => void

  private readonly modelCache = new Map<string, GatewayModel>()

  constructor(options: GatewayProviderOptions) {
    this.provider = options.provider
    this.apiKey = options.apiKey ?? ""
    this.baseURL = options.baseURL ?? ""
    this.defaultModel = options.model ?? ""
    this.headers = options.headers ?? {}
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES
    this.fetchImpl = (options.fetch ?? fetch) as unknown as typeof fetch
    this.onUsage = options.onUsage
    this.onCost = options.onCost
  }

  model(id?: string): GatewayModel {
    const modelId = id ?? this.defaultModel
    let cached = this.modelCache.get(modelId)
    if (!cached) {
      cached = this.buildModel(modelId)
      this.modelCache.set(modelId, cached)
    }
    return cached
  }

  abstract listModels(): Promise<ModelInfo[]>

  protected abstract buildModel(modelName: string): GatewayModel

  async fetchWithRetry(url: string | URL, init?: RequestInit): Promise<Response> {
    let lastError: unknown
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchImpl(url, init)
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500
        if (response.ok || !retryable || attempt === this.maxRetries) {
          if (!response.ok) {
            const body = await response.text().catch(() => "")
            const error: HttpError = new Error(`HTTP ${response.status} ${response.statusText}`) as HttpError
            error.status = response.status
            error.statusText = response.statusText
            error.body = body
            throw error
          }
          return response
        }
        lastError = new Error(`HTTP ${response.status} ${response.statusText}`)
      } catch (error) {
        lastError = error
        if (error instanceof Error && "status" in error && !((error as HttpError).status >= 500)) {
          throw this.normalizeError(error)
        }
      }
      if (attempt < this.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt))
      }
    }
    throw this.normalizeError(lastError)
  }

  createAbortController(external?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort(new Error("Request timed out"))
    }, this.timeoutMs)
    const onAbort = () => controller.abort()
    if (external) {
      if (external.aborted) {
        controller.abort()
      } else {
        external.addEventListener("abort", onAbort, { once: true })
      }
    }
    return {
      signal: controller.signal,
      cleanup: () => {
        clearTimeout(timer)
        external?.removeEventListener("abort", onAbort)
      },
    }
  }

  normalizeError(error: unknown): Error {
    if (error instanceof SdkError) return error
    if (error instanceof Error && error.name === "AbortError") {
      return new ConnectionError("Request aborted or timed out", { cause: error })
    }
    if (error instanceof Error && "status" in error) {
      const httpError = error as HttpError
      if (httpError.status === 401 || httpError.status === 403) {
        return new AuthError(`${this.provider} authentication failed: HTTP ${httpError.status}`, { cause: error })
      }
      if (httpError.status === 404) {
        return new ModelUnavailableError(`${this.provider} model not found: HTTP 404`, { cause: error })
      }
      if (httpError.status === 429) {
        return new ConnectionError(`${this.provider} rate limit exceeded: HTTP 429`, { cause: error })
      }
      if (httpError.status >= 500) {
        return new ModelUnavailableError(`${this.provider} provider error: HTTP ${httpError.status}`, { cause: error })
      }
    }
    if (error instanceof TypeError) {
      return new ConnectionError(`${this.provider} network error`, { cause: error })
    }
    return new SdkError(`${this.provider} gateway error`, { cause: error })
  }

  protected trackUsage(model: string, usage: LanguageModelUsage, durationMs: number | null): void {
    if (!this.onUsage) return
    // ai v4/v5 report flat usage fields; v6/v7 providers report nested token objects.
    const u = usage as unknown as {
      inputTokens?: number | { total?: number }
      outputTokens?: number | { text?: number }
      totalTokens?: number
      cachedInputTokens?: number
      inputTokenDetails?: { noCacheTokens?: number; cacheReadTokens?: number }
      outputTokenDetails?: { textTokens?: number }
    }
    const inputTokens =
      typeof u.inputTokens === "object" && u.inputTokens ? (u.inputTokens.total ?? 0) : (u.inputTokens ?? 0)
    const outputTokens =
      typeof u.outputTokens === "object" && u.outputTokens ? (u.outputTokens.text ?? 0) : (u.outputTokens ?? 0)
    this.onUsage({
      provider: this.provider,
      model,
      inputTokens,
      outputTokens,
      cachedInputTokens: u.cachedInputTokens ?? u.inputTokenDetails?.cacheReadTokens ?? 0,
      totalTokens: u.totalTokens ?? inputTokens + outputTokens,
      durationMs,
    })
  }

  protected async streamToContent(params: {
    model: GatewayModel
    modelId: string
    system?: string
    messages: ModelMessage[]
    tools?: ToolSet
    temperature?: number
    maxOutputTokens?: number
    signal?: AbortSignal
    onChunk?: (text: string) => void
    onReasoning?: (text: string) => void
    onToolCall?: (toolCall: { toolName: string; args: unknown }) => void
  }): Promise<{
    text: string
    reasoning: string
    toolCalls: Array<{ toolName: string; args: unknown }>
    usage: LanguageModelUsage
    finishReason: FinishReason
  }> {
    const startedAt = Date.now()
    const result = streamText({
      model: params.model as LanguageModel,
      system: params.system,
      messages: params.messages,
      tools: params.tools,
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
      abortSignal: params.signal,
    })

    let text = ""
    let reasoning = ""
    const toolCalls: Array<{ toolName: string; args: unknown }> = []

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          text += part.text
          params.onChunk?.(part.text)
          break
        case "reasoning-delta":
          reasoning += part.text
          params.onReasoning?.(part.text)
          break
        case "tool-call": {
          const args = typeof part.input === "string" ? safeParse(part.input) : part.input
          toolCalls.push({ toolName: part.toolName, args })
          params.onToolCall?.({ toolName: part.toolName, args })
          break
        }
      }
    }

    let usage = await result.usage
    let finishReason = await result.finishReason

    if (!text.trim() && toolCalls.length === 0) {
      const fallback = await generateText({
        model: params.model as LanguageModel,
        system: params.system,
        messages: params.messages,
        tools: params.tools,
        temperature: params.temperature,
        maxOutputTokens: params.maxOutputTokens,
        abortSignal: params.signal,
      })
      text = fallback.text
      reasoning = fallback.reasoningText ?? ""
      for (const call of fallback.toolCalls) {
        toolCalls.push({ toolName: call.toolName, args: call.input })
      }
      usage = fallback.usage
      finishReason = fallback.finishReason
    }

    this.trackUsage(params.modelId, usage, Date.now() - startedAt)
    return { text, reasoning, toolCalls, usage, finishReason }
  }
}

function safeParse(input: string): unknown {
  try {
    return JSON.parse(input)
  } catch {
    return input
  }
}

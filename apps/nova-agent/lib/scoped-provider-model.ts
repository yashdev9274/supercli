import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { OPENAI_COMPATIBLE_BASE_URLS, isOpenAICompatibleIntegration } from "@super/agent-runtime/integrations"
import type { StoredProviderConfig } from "@super/provider-runtime/config"
import { ProviderCredentialError } from "@super/provider-runtime/vault"
import type { LanguageModel } from "ai"
import { createHash } from "node:crypto"

import type { NovaScope } from "./scope"

type Model = Extract<LanguageModel, { specificationVersion: "v4" }>
type Options = Parameters<Model["doStream"]>[0]
type Part = Awaited<ReturnType<Model["doStream"]>>["stream"] extends ReadableStream<infer Value> ? Value : never
type Generated = Awaited<ReturnType<Model["doGenerate"]>>

class ProviderAdapterError extends Error {}

function checkedBody(body: ReadableStream<Uint8Array>, signal: AbortSignal, anthropic: boolean): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  const abort = () => { void reader.cancel().catch(() => {}) }
  signal.addEventListener("abort", abort, { once: true })
  const source = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        signal.throwIfAborted()
        const next = await reader.read()
        signal.throwIfAborted()
        if (next.done) {
          signal.removeEventListener("abort", abort)
          reader.releaseLock()
          controller.close()
        } else controller.enqueue(next.value)
      } catch (error) {
        signal.removeEventListener("abort", abort)
        await reader.cancel().catch(() => {})
        reader.releaseLock()
        controller.error(error)
      }
    },
    async cancel(reason) {
      signal.removeEventListener("abort", abort)
      await reader.cancel(reason).catch(() => {})
      reader.releaseLock()
    },
  })
  const decoder = new TextDecoder("utf-8", { fatal: true })
  let buffer = ""
  let bytes = 0
  let terminal = false
  return source.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      bytes += chunk.byteLength
      if (bytes > 8_000_000) throw new ProviderAdapterError("Provider stream exceeds limits")
      buffer += decoder.decode(chunk, { stream: true })
      while (true) {
        const separator = /\r\n\r\n|\n\n|\r\r/.exec(buffer)
        if (!separator) break
        if (separator.index > 1_000_000) throw new ProviderAdapterError("Provider frame exceeds limits")
        const frame = buffer.slice(0, separator.index)
        buffer = buffer.slice(separator.index + separator[0].length)
        const data = frame.split(/\r\n|\n|\r/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).replace(/^ /, "")).join("\n")
        if (terminal && data) throw new ProviderAdapterError("Provider sent data after completion")
        if (anthropic ? data && JSON.parse(data).type === "message_stop" : data === "[DONE]") terminal = true
      }
      if (buffer.length > 1_000_000) throw new ProviderAdapterError("Provider frame exceeds limits")
      controller.enqueue(chunk)
    },
    flush() {
      buffer += decoder.decode()
      if (!terminal || buffer.trim()) throw new ProviderAdapterError("Provider stream ended without a complete terminal frame")
    },
  }))
}

export function createScopedProviderModel(input: {
  scope: NovaScope
  authorize: (signal?: AbortSignal) => Promise<StoredProviderConfig>
  fetch?: typeof fetch
}): Model {
  const scope = Object.freeze({ ...input.scope })
  const anthropic = scope.provider === "anthropic"
  if (!anthropic && !isOpenAICompatibleIntegration(scope.provider)) throw new ProviderAdapterError("This integration has no supported Eve model adapter")
  const baseURL = anthropic ? "https://api.anthropic.com/v1" : OPENAI_COMPATIBLE_BASE_URLS[scope.provider as keyof typeof OPENAI_COMPATIBLE_BASE_URLS]
  const family = anthropic ? "Anthropic" : "OpenAI-compatible"
  const identity = createHash("sha256").update(JSON.stringify([scope.organizationId, scope.userId, scope.membershipId, scope.novaSessionId, scope.provider, scope.connectionId])).digest("base64url")
  const binding = { novaProvider: { scope: identity, provider: scope.provider, model: scope.model } }

  async function* parts(options: Options, signal: AbortSignal): AsyncGenerator<Part> {
    signal.throwIfAborted()
    if (scope.effort !== undefined) throw new ProviderAdapterError(`${family} reasoning effort is not supported by this adapter`)
    if (options.responseFormat?.type === "json") throw new ProviderAdapterError(`${family} structured output is not enabled`)
    if (options.topK !== undefined || options.reasoning !== undefined) throw new ProviderAdapterError("Provider-specific generation options require a native adapter")
    if (options.includeRawChunks) throw new ProviderAdapterError("Raw provider payload forwarding is not supported")
    if (Object.keys(options.providerOptions ?? {}).length) throw new ProviderAdapterError("Provider-specific options require a native adapter")
    for (const name of Object.keys(options.headers ?? {})) {
      if (!["traceparent", "tracestate", "baggage", "x-request-id", "user-agent"].includes(name.toLowerCase())) throw new ProviderAdapterError("Per-call provider authentication or routing headers are not permitted")
    }
    for (const message of options.prompt) {
      if (message.role === "user" && message.content.some((part) => part.type !== "text")) throw new ProviderAdapterError(`${family} Eve input currently supports text only`)
      if (message.role !== "assistant") continue
      const states = message.content.flatMap((part) => part.providerOptions?.novaProvider ? [part.providerOptions.novaProvider] : [])
      if (!states.length || states.some((state) => state.scope !== identity || state.provider !== scope.provider || state.model !== scope.model)) throw new ProviderAdapterError("Provider continuation belongs to another connection or model")
    }
    if (options.tools?.some((tool) => tool.type !== "function")) throw new ProviderAdapterError("Provider-executed tools are not supported")
    const config = await input.authorize(signal)
    signal.throwIfAborted()
    if (config.apiFamily && config.apiFamily !== (anthropic ? "anthropic" : "openai")) throw new ProviderAdapterError("The connection requires a different protocol adapter")
    if (!config.apiKey?.trim()) throw new ProviderAdapterError("Connect a provider API key before inference")
    const configuredURL = config.baseUrl?.replace(/\/+$/, "")
    if (configuredURL && configuredURL !== baseURL && !(anthropic && configuredURL === "https://api.anthropic.com")) throw new ProviderAdapterError("Custom or alternate provider endpoints require a separately verified network policy")
    if (config.models?.length && !config.models.some((entry) => entry.id === scope.model)) throw new ProviderAdapterError("Selected model is not in this connection's configured catalog")
    const headers = new Headers(config.headers)
    const forwardedHeaders: Record<string, string> = {}
    headers.forEach((value, name) => {
      if (!["http-referer", "x-title"].includes(name)) throw new ProviderAdapterError("Unsupported provider header configuration")
      forwardedHeaders[name] = value
    })
    const fetcher = (async (url, init) => {
        const target = new URL(String(url))
        if (target.href !== `${baseURL}/${anthropic ? "messages" : "chat/completions"}`) throw new ProviderAdapterError("Unexpected provider endpoint")
        const response = await (input.fetch ?? fetch)(url, { ...init, redirect: "error", cache: "no-store", signal })
        if (!response.ok) {
          await response.body?.cancel()
          throw new ProviderAdapterError(`Provider returned HTTP ${response.status}`)
        }
        if (!response.body || !response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream")) {
          await response.body?.cancel()
          throw new ProviderAdapterError("Provider returned an unsupported response format")
        }
        return new Response(checkedBody(response.body, signal, anthropic), { status: response.status, headers: response.headers })
    }) as typeof fetch
    const source = anthropic
      ? (await import("@ai-sdk/anthropic")).createAnthropic({ baseURL, apiKey: config.apiKey, headers: forwardedHeaders, fetch: fetcher }).languageModel(scope.model)
      : createOpenAICompatible({ name: "nova-compatible", baseURL, apiKey: config.apiKey, headers: forwardedHeaders, includeUsage: true, fetch: fetcher }).chatModel(scope.model)
    const response = await source.doStream({ ...options, abortSignal: signal })
    const reader = response.stream.getReader()
    const calls: Extract<Part, { type: "tool-call" }>[] = []
    const offered = options.tools?.flatMap((tool) => tool.type === "function" ? [tool.name] : []) ?? []
    const choice = options.toolChoice
    const names = new Set(choice?.type === "none" ? [] : choice?.type === "tool" ? offered.filter((name) => name === choice.toolName) : offered)
    const ids = new Set<string>()
    let finish: Extract<Part, { type: "finish" }> | undefined
    let text = false
    try {
      while (true) {
        signal.throwIfAborted()
        const next = await reader.read()
        if (next.done) break
        const part = next.value
        if (part.type === "error") throw new ProviderAdapterError("Provider stream failed")
        if (part.type === "reasoning-start" || part.type === "reasoning-delta") throw new ProviderAdapterError("Provider-specific reasoning continuation is not supported by this adapter")
        if (part.type === "tool-call") {
          const args = JSON.parse(part.input)
          if (!part.toolCallId || ids.has(part.toolCallId) || !names.has(part.toolName) || !args || typeof args !== "object" || Array.isArray(args) || part.input.length > 24_000 || calls.length >= 32) throw new ProviderAdapterError("Provider returned invalid tool calls")
          ids.add(part.toolCallId)
          calls.push({ ...part, providerMetadata: { ...part.providerMetadata, ...binding } })
        } else if (part.type === "finish") finish = part
        else if (part.type === "text-end") yield { ...part, providerMetadata: { ...part.providerMetadata, ...binding } }
        else {
          if (part.type === "text-delta" && part.delta) text = true
          yield part
        }
      }
      if (!finish || !["stop", "tool-calls"].includes(finish.finishReason.unified) || (!text && !calls.length)) throw new ProviderAdapterError("Provider did not complete the response")
      if ((finish.finishReason.unified === "tool-calls") !== (calls.length > 0)) throw new ProviderAdapterError("Provider tool-call completion is inconsistent")
      if ((options.toolChoice?.type === "required" || options.toolChoice?.type === "tool") && !calls.length) throw new ProviderAdapterError("Provider ignored required tool choice")
      for (const call of calls) yield call
      yield finish
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }

  const model: Model = {
    specificationVersion: "v4", provider: `nova-${scope.provider}`, modelId: scope.model, supportedUrls: {},
    async doStream(options) {
      const cancellation = new AbortController()
      const signal = AbortSignal.any([cancellation.signal, AbortSignal.timeout(180_000), ...(options.abortSignal ? [options.abortSignal] : [])])
      const iterator = parts(options, signal)
      return { stream: new ReadableStream<Part>({
        async pull(controller) {
          try {
            const next = await iterator.next()
            if (next.done) controller.close()
            else controller.enqueue(next.value)
          } catch (error) {
            controller.error(error instanceof ProviderAdapterError || error instanceof ProviderCredentialError ? error : new Error(signal.aborted ? "Provider request cancelled or timed out" : `${family} request failed or was incomplete; check the connection and supported model options`))
          }
        },
        async cancel(reason) { cancellation.abort(reason); await iterator.return(undefined) },
      }) }
    },
    async doGenerate(options) {
      const { stream } = await model.doStream(options)
      const reader = stream.getReader()
      const content: Generated["content"] = []
      const texts = new Map<string, Extract<Generated["content"][number], { type: "text" }>>()
      let finish: Extract<Part, { type: "finish" }> | undefined
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          const part = next.value
          if (part.type === "text-start") { const item = { type: "text" as const, text: "" }; texts.set(part.id, item); content.push(item) }
          else if (part.type === "text-delta") { const item = texts.get(part.id); if (item) item.text += part.delta }
          else if (part.type === "text-end") { const item = texts.get(part.id); if (item) item.providerMetadata = part.providerMetadata }
          else if (part.type === "tool-call") content.push(part)
          else if (part.type === "finish") finish = part
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
      if (!finish) throw new ProviderAdapterError("Provider response did not complete")
      return { content, finishReason: finish.finishReason, usage: finish.usage, warnings: [] }
    },
  }
  return model
}

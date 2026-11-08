import { reserveInference, settleInference, settleInferenceUnknown } from "../lib/credit-meter"
import { getContextWindow } from "../cli/ai/context-windows"
import { checkPlanGate } from "../lib/plan-gate"
import { checkDailyTokenBudget } from "../lib/token-budget"

type Usage = { inputTokens: number; outputTokens: number; cachedInputTokens: number }

export function clientInferenceKey(body: Record<string, unknown>): string | undefined {
  return body.provider === "concentrateai" && typeof body.concentrateAiKey === "string"
    ? body.concentrateAiKey.trim() || undefined
    : undefined
}

export function inferenceErrorStatus(error: unknown): number {
  const status = Number((error as any)?.status ?? (error as any)?.statusCode)
  if (status >= 400 && status <= 599) return status
  const cause = (error as any)?.lastError ?? (error as any)?.cause
  return cause && cause !== error ? inferenceErrorStatus(cause) : 503
}

export function createInferenceFetch(options: {
  userId: string
  provider: string
  model?: string
  clientKey?: string
  signal?: AbortSignal
  maxOutputTokens: (model: string) => number
  fetcher?: typeof fetch
  reserve?: typeof reserveInference
  settle?: typeof settleInference
  settleUnknown?: typeof settleInferenceUnknown
  planGate?: typeof checkPlanGate
}): typeof fetch {
  const fetcher = options.fetcher ?? globalThis.fetch
  return (async (url: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(url, init)
    const body = await request.clone().json() as Record<string, any>
    const endpointModel = new URL(request.url).pathname.match(/\/models\/([^/:]+)/)?.[1]
    const rawModel = body.model ?? endpointModel ?? options.model
    if (typeof rawModel !== "string" || !rawModel.trim()) throw Object.assign(new Error("Inference model is required"), { status: 400 })
    const model = options.provider === "neon" ? `neon/${rawModel}` : rawModel
    const contextWindow = getContextWindow(rawModel)
    const generation = options.provider === "google" ? (body.generationConfig ??= {}) : undefined
    const requested = body.max_completion_tokens ?? body.max_tokens ?? generation?.maxOutputTokens ?? options.maxOutputTokens(rawModel)
    if (!Number.isSafeInteger(requested) || requested <= 0) throw Object.assign(new Error("Invalid output token limit"), { status: 400 })
    const maxOutputTokens = Math.min(requested, options.maxOutputTokens(rawModel), contextWindow - 1)
    if (generation) generation.maxOutputTokens = maxOutputTokens
    else if (body.max_completion_tokens !== undefined) body.max_completion_tokens = maxOutputTokens
    else body.max_tokens = maxOutputTokens
    if (body.stream === true && options.provider !== "minimax") body.stream_options = { ...body.stream_options, include_usage: true }
    const input = JSON.stringify({ messages: body.messages, contents: body.contents, system: body.system, systemInstruction: body.systemInstruction, tools: body.tools, toolConfig: body.toolConfig, response_format: body.response_format })
    const hasMedia = /"(?:image_url|inlineData|fileData|image|audio|video)"\s*:/.test(input)
    const inputBytes = Buffer.byteLength(input)
    if (inputBytes > 16 * 1024 * 1024) throw Object.assign(new Error("Inference input is too large"), { status: 413 })
    const overhead = 1024 + (body.messages?.length ?? body.contents?.length ?? 0) * 64
    const nativeDeepSeek = (options.provider === "concentrateai" || options.provider === "supercode") && (rawModel === "deepseek-v4-flash" || rawModel === "deepseek/deepseek-v4-flash")
    const inputTokens = hasMedia || nativeDeepSeek ? contextWindow : Math.min(inputBytes + overhead, contextWindow)
    const gate = await (options.planGate ?? checkPlanGate)(options.userId, model, { totalTokens: nativeDeepSeek ? Math.min(inputBytes + overhead, contextWindow) : inputBytes + overhead, nativeDeepSeek })
    if (!gate.allowed) throw Object.assign(new Error(gate.message || "Plan limit exceeded"), { status: 403 })
    if (!options.clientKey && gate.plan?.tier !== "spark") await checkDailyTokenBudget(options.userId)
    const signal = AbortSignal.any([request.signal, ...(options.signal ? [options.signal] : [])])
    signal.throwIfAborted()
    const reservation = options.clientKey ? undefined : await (options.reserve ?? reserveInference)(options.userId, model, { inputTokens, maxOutputTokens })
    let settlement: Promise<unknown> | undefined
    const settle = async (usage: Usage) => {
      if (!reservation) return
      settlement ??= (options.settle ?? settleInference)(reservation.id, model, usage)
      await settlement
    }
    const settleUnknown = async () => {
      if (!reservation) return
      settlement ??= (options.settleUnknown ?? settleInferenceUnknown)(reservation)
      await settlement
    }
    let response: Response
    let dispatched = false
    try {
      signal.throwIfAborted()
      const headers = new Headers(request.headers)
      headers.delete("content-length")
      dispatched = true
      response = await fetcher(request.url, { method: request.method, headers, body: JSON.stringify(body), signal })
    } catch (error) {
      if (dispatched) await settleUnknown()
      else await settle({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 })
      throw error
    }
    let usage: Partial<Usage> = {}
    const observe = (data: any) => {
      const openai = data.usage
      const google = data.usageMetadata
      const anthropic = data.message?.usage ?? (openai?.input_tokens !== undefined || openai?.output_tokens !== undefined ? openai : undefined)
      if (google) usage = { inputTokens: google.promptTokenCount, outputTokens: (google.candidatesTokenCount ?? 0) + (google.thoughtsTokenCount ?? 0), cachedInputTokens: google.cachedContentTokenCount ?? 0 }
      else if (anthropic) {
        if (anthropic.input_tokens !== undefined) {
          usage.inputTokens = anthropic.input_tokens + (anthropic.cache_read_input_tokens ?? 0) + (anthropic.cache_creation_input_tokens ?? 0)
          usage.cachedInputTokens = anthropic.cache_read_input_tokens ?? 0
        }
        if (anthropic.output_tokens !== undefined) usage.outputTokens = anthropic.output_tokens
      } else if (openai?.prompt_tokens !== undefined) usage = { inputTokens: openai.prompt_tokens, outputTokens: openai.completion_tokens, cachedInputTokens: openai.prompt_tokens_details?.cached_tokens ?? openai.prompt_cache_hit_tokens ?? 0 }
    }
    const finalUsage = (): Usage | undefined => {
      if (!Number.isSafeInteger(usage.inputTokens) || !Number.isSafeInteger(usage.outputTokens) || usage.inputTokens! < 0 || usage.outputTokens! < 0) return undefined
      return { inputTokens: usage.inputTokens!, outputTokens: usage.outputTokens!, cachedInputTokens: Math.min(usage.inputTokens!, Math.max(0, usage.cachedInputTokens ?? 0)) }
    }
    const settleObserved = async () => {
      const actual = finalUsage()
      if (actual) await settle(actual)
      else await settleUnknown()
    }
    if (!response.ok) {
      try { observe(await response.clone().json()) } catch {}
      await settle(finalUsage() ?? { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 })
      return response
    }
    if (!response.body) {
      await settleUnknown()
      return response
    }
    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
      try {
        const text = await response.text()
        observe(JSON.parse(text))
        await settleObserved()
        return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers })
      } catch (error) {
        await settleUnknown()
        throw error
      }
    }
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let pending = ""
    const parseLine = (line: string) => {
      if (!line.startsWith("data:")) return
      try { observe(JSON.parse(line.slice(5).trim())) } catch {}
    }
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()
          if (done) {
            pending += decoder.decode()
            if (pending) parseLine(pending)
            await settleObserved()
            controller.close()
            return
          }
          pending += decoder.decode(value, { stream: true })
          const lines = pending.split("\n")
          pending = lines.pop() ?? ""
          for (const line of lines) parseLine(line)
          controller.enqueue(value)
        } catch (error) {
          try { await settleObserved() } catch (settlementError) { error = settlementError }
          controller.error(error)
        }
      },
      async cancel(reason) {
        try { await reader.cancel(reason) } finally { await settleObserved() }
      },
    })
    return new Response(stream, { status: response.status, statusText: response.statusText, headers: response.headers })
  }) as typeof fetch
}

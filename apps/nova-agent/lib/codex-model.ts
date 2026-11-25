import type { LanguageModel } from "ai"
import { isDeepStrictEqual } from "node:util"
import type { NativeCodexTransport } from "@super/codex-runtime/runtime"
import type { CompletedResponse, ResponseItem } from "@super/codex-runtime/responses"

type Model = Extract<LanguageModel, { specificationVersion: "v3" }>
type Options = Parameters<Model["doStream"]>[0]
type StreamPart = Awaited<ReturnType<Model["doStream"]>>["stream"] extends ReadableStream<infer Part> ? Part : never
type Generated = Awaited<ReturnType<Model["doGenerate"]>>

export function createEveCodexModel(input: {
  model: string
  scope: string
  authorize: (signal?: AbortSignal) => Promise<NativeCodexTransport>
}): Model {
  async function* parts(options: Options, signal: AbortSignal): AsyncGenerator<StreamPart> {
    signal.throwIfAborted()
    if (options.responseFormat?.type === "json") throw new Error("Codex Eve adapter does not support structured output")
    for (const name of ["maxOutputTokens", "temperature", "stopSequences", "topP", "topK", "presencePenalty", "frequencyPenalty", "seed"] as const) {
      if (options[name] !== undefined) throw new Error(`Codex Eve adapter does not support ${name}`)
    }
    const items: ResponseItem[] = []
    const instructions: string[] = []
    const pending = new Set<string>()
    const seen = new Set<string>()
    for (const message of options.prompt) {
      if (message.role === "system") {
        instructions.push(message.content)
        continue
      }
      if (message.role === "assistant") {
        const native = message.content.flatMap((part) => {
          const state = part.providerOptions?.novaCodex
          if (!state) return []
          if (state.scope !== input.scope || state.model !== input.model || !Array.isArray(state.output)) {
            throw new Error("Codex continuation belongs to another account scope or model")
          }
          return state.output as ResponseItem[]
        })
        if (native.length) {
          const calls = message.content.filter((part) => part.type === "tool-call")
          const nativeCalls = native.filter((item) => item.type === "function_call")
          if (calls.length !== nativeCalls.length || nativeCalls.some((item) => !calls.some((call) => call.toolCallId === item.call_id && call.toolName === item.name && isDeepStrictEqual(call.input, JSON.parse(String(item.arguments)))))) {
            throw new Error("Codex continuation does not match recorded tool calls")
          }
          for (const call of nativeCalls) {
            const id = String(call.call_id)
            if (seen.has(id)) throw new Error("Duplicate Codex tool-call identity")
            seen.add(id)
            pending.add(id)
          }
          items.push(...native)
        } else {
          if (message.content.some((part) => part.type !== "text")) throw new Error("Codex native continuation is missing")
          items.push({ role: "assistant", content: message.content.map((part) => part.type === "text" ? part.text : "").join("\n") })
        }
        continue
      }
      if (message.role === "tool") {
        for (const part of message.content) {
          if (part.type !== "tool-result" || !pending.delete(part.toolCallId)) throw new Error("Codex tool result has no matching pending call")
          const output = part.output
          if (!["text", "json", "error-text", "error-json"].includes(output.type) || !("value" in output)) throw new Error("Unsupported Codex tool result")
          items.push({ type: "function_call_output", call_id: part.toolCallId, output: typeof output.value === "string" ? output.value : JSON.stringify(output.value) })
        }
        continue
      }
      if (message.content.some((part) => part.type !== "text")) throw new Error("Codex Eve compatibility currently accepts text input only")
      items.push({ role: "user", content: message.content.map((part) => part.type === "text" ? part.text : "").join("\n") })
    }
    if (pending.size) throw new Error("Codex tool continuation is incomplete")
    if (JSON.stringify(items).length > 4_000_000) throw new Error("Codex continuation exceeds the compatibility limit")
    if (options.tools?.some((tool) => tool.type !== "function")) throw new Error("Codex provider-executed tools are not supported")
    const infer = await input.authorize(signal)
    signal.throwIfAborted()
    const choice = options.toolChoice
    const stream = infer({
      items,
      instructions: instructions.join("\n\n"),
      tools: options.tools?.flatMap((tool) => tool.type === "function" ? [{ type: "function", function: { name: tool.name, description: tool.description ?? "", parameters: { ...tool.inputSchema } } }] : []),
      toolChoice: choice?.type === "tool" ? { type: "function", name: choice.toolName } : choice?.type ?? "auto",
      signal,
    })
    let text = false
    let reasoning = false
    let completed: CompletedResponse | undefined
    let usage: Record<string, unknown> = {}
    yield { type: "stream-start", warnings: [] }
    try {
      while (true) {
        signal.throwIfAborted()
        const next = await stream.next()
        if (next.done) { completed = next.value; break }
        const event = next.value
        if (event.type === "error") throw new Error(event.message)
        if (event.type === "text") {
          if (!text) yield { type: "text-start", id: "text" }
          text = true
          yield { type: "text-delta", id: "text", delta: event.content }
        } else if (event.type === "reasoning") {
          if (!reasoning) yield { type: "reasoning-start", id: "reasoning" }
          reasoning = true
          yield { type: "reasoning-delta", id: "reasoning", delta: event.content }
        } else if (event.type === "finish") usage = event.usage ?? {}
      }
    } finally {
      await stream.return({ output: [], calls: [] })
    }
    if (!completed || (!text && !completed.calls.length)) throw new Error("Codex returned no completed reply or tool calls")
    if (JSON.stringify(completed.output).length > 1_000_000) throw new Error("Codex native response exceeds the compatibility limit")
    const providerMetadata = { novaCodex: { scope: input.scope, model: input.model, output: JSON.parse(JSON.stringify(completed.output)) } }
    if (reasoning) yield { type: "reasoning-end", id: "reasoning" }
    if (text) yield { type: "text-end", id: "text", ...(!completed.calls.length ? { providerMetadata } : {}) }
    for (const [index, call] of completed.calls.entries()) {
      yield { type: "tool-call", toolCallId: call.id, toolName: call.name, input: JSON.stringify(call.args), ...(index === 0 ? { providerMetadata } : {}) }
    }
    const tokens = (name: string) => typeof usage[name] === "number" ? usage[name] as number : 0
    yield {
      type: "finish",
      finishReason: { unified: completed.calls.length ? "tool-calls" : "stop", raw: completed.calls.length ? "tool_calls" : "stop" },
      usage: {
        inputTokens: { total: tokens("input_tokens"), noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: tokens("output_tokens"), text: undefined, reasoning: undefined },
      },
    }
  }

  const model: Model = {
    specificationVersion: "v3",
    provider: "nova-codex",
    modelId: input.model,
    supportedUrls: {},
    async doStream(options) {
      const cancellation = new AbortController()
      const signal = AbortSignal.any([cancellation.signal, ...(options.abortSignal ? [options.abortSignal] : [])])
      const iterator = parts(options, signal)
      return { stream: new ReadableStream<StreamPart>({
        async pull(controller) {
          try {
            const next = await iterator.next()
            if (next.done) controller.close()
            else controller.enqueue(next.value)
          } catch (error) { controller.error(error) }
        },
        async cancel(reason) {
          cancellation.abort(reason)
          await iterator.return(undefined)
        },
      }) }
    },
    async doGenerate(options) {
      const result = await model.doStream(options)
      const reader = result.stream.getReader()
      const content: Generated["content"] = []
      const active = new Map<string, Extract<Generated["content"][number], { type: "text" | "reasoning" }>>()
      let finish: Extract<StreamPart, { type: "finish" }> | undefined
      try {
        while (true) {
          const next = await reader.read()
          if (next.done) break
          const part = next.value
          if (part.type === "text-start" || part.type === "reasoning-start") {
            const item = { type: part.type === "text-start" ? "text" as const : "reasoning" as const, text: "" }
            active.set(part.id, item)
            content.push(item)
          } else if (part.type === "text-delta" || part.type === "reasoning-delta") {
            const item = active.get(part.id)
            if (item) item.text += part.delta
          } else if (part.type === "text-end" || part.type === "reasoning-end") {
            const item = active.get(part.id)
            if (item && part.providerMetadata) item.providerMetadata = part.providerMetadata
          } else if (part.type === "tool-call") content.push(part)
          else if (part.type === "finish") finish = part
        }
      } finally {
        await reader.cancel().catch(() => {})
        reader.releaseLock()
      }
      if (!finish) throw new Error("Codex response ended without completion")
      return { content, finishReason: finish.finishReason, usage: finish.usage, warnings: [] }
    },
  }
  return model
}

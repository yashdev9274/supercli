import { z } from "zod"

import type { HarnessChatMessage, HarnessChatTool, HarnessStreamEvent } from "../harness/client"

const catalogSchema = z.object({
  models: z.array(z.object({
    slug: z.string().min(1).max(128),
    display_name: z.string().min(1).max(200),
    visibility: z.string(),
  })),
})

export type ChatGPTModel = { id: string; label: string }
export type ResponseItem = Record<string, unknown>
export type ResponsesRequest = {
  model: string
  store: false
  stream: true
  input: ResponseItem[]
  tools?: Array<{ type: "namespace"; name: string; description: string; tools: ResponseItem[] }>
}

export function parseAccountModels(value: unknown): ChatGPTModel[] {
  const parsed = catalogSchema.safeParse(value)
  if (!parsed.success) throw new Error("Invalid ChatGPT model catalog")
  const { models } = parsed.data
  const seen = new Set<string>()
  return models.flatMap((model) => {
    if (model.visibility !== "list" || seen.has(model.slug)) return []
    seen.add(model.slug)
    return [{ id: model.slug, label: model.display_name }]
  })
}

/** Offline contract only: no fetch, credentials, or production routing. Reconfirm against hosted approval. */
export function prepareResponsesRequest(input: {
  model: string
  models: readonly ChatGPTModel[]
  messages: readonly HarnessChatMessage[]
  tools?: readonly HarnessChatTool[]
}): ResponsesRequest {
  if (!input.models.some((model) => model.id === input.model)) throw new Error("ChatGPT model is not available for this account")
  const messages: ResponseItem[] = input.messages.map((message) => {
    if (typeof message.content !== "string" || message.tool_calls || message.role === "tool") {
      throw new Error("Use native Responses items for tool continuations and multimodal content")
    }
    return { role: message.role === "system" ? "developer" : message.role, content: message.content }
  })
  const names = new Set<string>()
  const tools = input.tools?.map((tool) => {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.function.name) || names.has(tool.function.name)) {
      throw new Error("Invalid or duplicate ChatGPT tool name")
    }
    names.add(tool.function.name)
    return { type: "function", name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters }
  })
  return {
    model: input.model,
    store: false,
    stream: true,
    input: messages,
    ...(tools?.length ? { tools: [{ type: "namespace" as const, name: "nova", description: "Nova tools", tools }] } : {}),
  }
}

const outputItemSchema = z.object({ type: z.string(), id: z.string().optional() }).passthrough()
const completedSchema = z.object({
  type: z.literal("response.completed"),
  response: z.object({
    status: z.literal("completed"),
    output: z.array(outputItemSchema),
    usage: z.object({
      input_tokens: z.number().nonnegative(),
      output_tokens: z.number().nonnegative(),
      total_tokens: z.number().nonnegative(),
    }).optional(),
  }),
})
const deltaSchema = z.object({ type: z.literal("response.output_text.delta"), delta: z.string() })
const callSchema = z.object({
  type: z.literal("function_call"),
  id: z.string().min(1),
  call_id: z.string().min(1),
  name: z.string().min(1),
  arguments: z.string(),
  namespace: z.string().optional(),
}).passthrough()

export type CompletedResponse = { output: ResponseItem[]; calls: Array<{ id: string; name: string; args: Record<string, unknown> }> }

/** Maps parsed SSE payloads, not wire framing. Raw provider error messages are never forwarded. */
export class ResponsesAccumulator {
  private terminal = false
  private failed = false
  private result: CompletedResponse | null = null

  accept(value: unknown): HarnessStreamEvent[] {
    if (this.terminal) throw new Error("ChatGPT sent data after a terminal event")
    try {
      return this.parse(value)
    } catch {
      this.terminal = true
      this.failed = true
      this.result = null
      throw new Error("Invalid ChatGPT stream event")
    }
  }

  private parse(value: unknown): HarnessStreamEvent[] {
    if (!value || typeof value !== "object" || !("type" in value)) throw new Error("Invalid ChatGPT stream event")
    const type = value.type
    if (type === "response.failed" || type === "response.incomplete" || type === "error") {
      this.terminal = true
      this.failed = true
      const failure = value as { response?: { error?: { code?: unknown } }; code?: unknown }
      const code = failure.response?.error?.code ?? failure.code
      const limited = code === "subscription_sharing_usage_limit_exceeded" || code === "subscription_sharing_usage_unavailable"
      return [{ type: "error", message: limited
        ? "ChatGPT plan usage is unavailable or its limit was reached. Manage usage in ChatGPT settings."
        : "ChatGPT did not complete this response. Retry or reconnect your account." }]
    }
    if (type === "response.output_text.delta") {
      return [{ type: "text", content: deltaSchema.parse(value).delta }]
    }
    if (type === "response.reasoning_summary_text.delta" || type === "response.reasoning_text.delta") {
      const delta = z.object({ delta: z.string() }).parse(value).delta
      return [{ type: "reasoning", content: delta }]
    }
    if (type !== "response.completed") return []
    const { response } = completedSchema.parse(value)
    const calls: CompletedResponse["calls"] = []
    const seen = new Set<string>()
    for (const item of response.output) {
      if (item.type !== "function_call") continue
      const call = callSchema.parse(item)
      if (seen.has(call.call_id) || (call.namespace && call.namespace !== "nova")) throw new Error("Invalid ChatGPT tool call")
      seen.add(call.call_id)
      const args: unknown = JSON.parse(call.arguments)
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Invalid ChatGPT tool arguments")
      calls.push({ id: call.call_id, name: call.name, args: args as Record<string, unknown> })
    }
    this.result = { output: response.output, calls }
    this.terminal = true
    return [
      ...calls.map((call): HarnessStreamEvent => ({ type: "tool-call", toolCallId: call.id, toolName: call.name, args: call.args })),
      { type: "finish", reason: calls.length ? "tool_calls" : "stop", ...(response.usage ? { usage: response.usage } : {}) },
    ]
  }

  completed(): CompletedResponse {
    if (!this.terminal || this.failed || !this.result) throw new Error("ChatGPT stream ended without a completed response")
    return structuredClone(this.result)
  }
}

export function continueResponsesRequest(
  request: ResponsesRequest,
  completed: CompletedResponse,
  results: readonly { callId: string; output: string }[],
): ResponsesRequest {
  const expected = new Set(completed.calls.map((call) => call.id))
  if (results.length !== expected.size || new Set(results.map((result) => result.callId)).size !== expected.size
    || results.some((result) => !expected.has(result.callId))) {
    throw new Error("ChatGPT tool results do not match pending calls")
  }
  return {
    ...request,
    input: [
      ...request.input,
      ...completed.output,
      ...results.map((result) => ({ type: "function_call_output", call_id: result.callId, output: result.output })),
    ],
  }
}

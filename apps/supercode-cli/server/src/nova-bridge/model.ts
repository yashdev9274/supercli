import type { LanguageModel } from "ai"

type Model = Extract<LanguageModel, { specificationVersion: "v3" }>
type Prompt = Parameters<Model["doStream"]>[0]["prompt"]
export type Rpc = (kind: "inference" | "tool", payload: Record<string, unknown>) => Promise<unknown>

export function bridgeMessages(prompt: Prompt): Record<string, unknown>[] {
  return prompt.flatMap((message): Record<string, unknown>[] => {
    if (message.role === "system") return [{ role: "system", content: message.content }]
    if (message.role === "tool") return message.content.map((part) => {
      if (part.type !== "tool-result") throw new Error("Unsupported bridge tool content")
      const output = part.output
      return { role: "tool", tool_call_id: part.toolCallId, content: output.type === "text" ? output.value : JSON.stringify("value" in output ? output.value : output) }
    })
    const content = message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n")
    const calls = message.content.flatMap((part) => part.type === "tool-call" ? [{ id: part.toolCallId, type: "function", function: { name: part.toolName, arguments: JSON.stringify(part.input) } }] : [])
    return [{ role: message.role, content, ...(calls.length ? { tool_calls: calls } : {}) }]
  })
}

/** Inference only. All continuation and execution remain inside the original harness. */
export function createBridgeModel(rpc: Rpc): Model {
  let round = 0
  return {
    specificationVersion: "v3", provider: "nova-bridge", modelId: "authorized-web-provider", supportedUrls: {},
    doGenerate: async () => { throw new Error("Bridge supports streaming inference only") },
    doStream: async (options) => {
      options.abortSignal?.throwIfAborted()
      const current = round++
      const raw = await rpc("inference", {
        messages: bridgeMessages(options.prompt),
        tools: options.tools?.flatMap((tool) => tool.type === "function" ? [{ type: "function", function: { name: tool.name, description: tool.description ?? "", parameters: tool.inputSchema } }] : []),
      })
      if (!Array.isArray(raw) || raw.length > 10_000) throw new Error("Invalid inference reply")
      type Part = Awaited<ReturnType<Model["doStream"]>>["stream"] extends ReadableStream<infer P> ? P : never
      const parts: Part[] = [{ type: "stream-start", warnings: [] }]
      let reason = "stop"
      let usage: Record<string, unknown> = {}
      let text = false
      let reasoning = false
      let calls = 0
      const ids = new Set<string>()
      for (const event of raw as Record<string, unknown>[]) {
        if (event.type === "error") throw new Error(typeof event.message === "string" ? event.message : "Inference failed")
        if (event.type === "text" && typeof event.content === "string") {
          if (!text) parts.push({ type: "text-start", id: "text" })
          text = true
          parts.push({ type: "text-delta", id: "text", delta: event.content })
        } else if (event.type === "reasoning" && typeof event.content === "string") {
          if (!reasoning) parts.push({ type: "reasoning-start", id: "reasoning" })
          reasoning = true
          parts.push({ type: "reasoning-delta", id: "reasoning", delta: event.content })
        } else if (event.type === "tool-call") {
          if (typeof event.toolCallId !== "string" || typeof event.toolName !== "string" || !event.args || typeof event.args !== "object") throw new Error("Invalid inference tool call")
          const id = `${current}_${event.toolCallId}`
          if (ids.has(id)) continue
          ids.add(id)
          if (++calls > 32) throw new Error("Agent reached its tool-call budget")
          parts.push({ type: "tool-call", toolCallId: id, toolName: event.toolName, input: JSON.stringify(event.args) })
        } else if (event.type === "finish") {
          reason = typeof event.reason === "string" ? event.reason : "stop"
          usage = event.usage && typeof event.usage === "object" ? event.usage as Record<string, unknown> : {}
          if (reason === "error") throw new Error("The harness failed before completing the response")
        }
      }
      if (text) parts.push({ type: "text-end", id: "text" })
      if (reasoning) parts.push({ type: "reasoning-end", id: "reasoning" })
      if (!text && !calls) throw new Error("Harness returned an empty response")
      if (!calls && ["tool_calls", "tool-calls"].includes(reason)) throw new Error("Incomplete tool calls")
      const tokens = (key: string) => typeof usage[key] === "number" ? usage[key] as number : 0
      parts.push({ type: "finish", finishReason: { unified: calls ? "tool-calls" : reason === "length" ? "length" : "stop", raw: reason }, usage: {
        inputTokens: { total: tokens("inputTokens"), noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: tokens("outputTokens"), text: undefined, reasoning: undefined },
      } })
      return { stream: new ReadableStream({ start(controller) { for (const part of parts) controller.enqueue(part); controller.close() } }) }
    },
  }
}

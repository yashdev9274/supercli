import { jsonSchema, streamText, type ModelMessage, type ToolSet } from "ai"
import { createNeonModel } from "../../cli/ai/neon-service"

// Accept the OpenAI wire history used by Nova as well as SDK-native history.
export function neonMessages(messages: Array<Record<string, any>>): ModelMessage[] {
  const toolNames = new Map<string, string>()
  for (const message of messages) {
    for (const call of message.tool_calls ?? []) toolNames.set(call.id, call.function.name)
  }
  return messages.map((message): ModelMessage => {
    if (message.role === "tool" && message.tool_call_id) {
      return { role: "tool", content: [{ type: "tool-result", toolCallId: message.tool_call_id, toolName: message.name || toolNames.get(message.tool_call_id) || "tool", output: { type: "text", value: typeof message.content === "string" ? message.content : JSON.stringify(message.content) } }] }
    }
    if (message.role === "assistant" && message.tool_calls) {
      return { role: "assistant", content: [
        ...(message.content ? [{ type: "text" as const, text: String(message.content) }] : []),
        ...message.tool_calls.map((call: any) => ({ type: "tool-call", toolCallId: call.id, toolName: call.function.name, input: JSON.parse(call.function.arguments || "{}") })),
      ] }
    }
    if (message.role === "user" && Array.isArray(message.content)) {
      return { role: "user", content: message.content.map((part: any) => part.type === "image_url" ? { type: "image", image: part.image_url.url } : part) }
    }
    return message as ModelMessage
  })
}

export function neonTools(tools?: Record<string, any>): ToolSet | undefined {
  if (!tools) return undefined
  return Object.fromEntries(Object.entries(tools).map(([name, def]) => [name, {
    description: def.description || "",
    inputSchema: jsonSchema(def.parameters ?? def.inputSchema ?? { type: "object", properties: {} }),
  }]))
}

export async function streamNeonChat(options: {
  model: string
  messages: Array<Record<string, any>>
  tools?: Record<string, any>
  signal?: AbortSignal
  write: (event: Record<string, unknown>) => void
}) {
  const result = streamText({
    model: createNeonModel(options.model),
    messages: neonMessages(options.messages),
    tools: neonTools(options.tools),
    abortSignal: options.signal,
  })
  let emittedToolCalls = false
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") options.write({ type: "text", content: part.text })
    else if (part.type === "reasoning-delta") options.write({ type: "reasoning", content: part.text })
    else if (part.type === "tool-call") {
      emittedToolCalls = true
      options.write({ type: "tool-call", toolName: part.toolName, args: part.input, toolCallId: part.toolCallId })
    } else if (part.type === "error") throw part.error
  }
  const usage = await result.usage
  options.write({ type: "finish", reason: emittedToolCalls ? "tool_calls" : await result.finishReason, usage })
  return usage
}

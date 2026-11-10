import type { HarnessChatMessage, DurableChatTransport } from "@/modules/nova/harness/client"
import type { ProviderCredentialProvider } from "./server"

function textOf(content: HarnessChatMessage["content"]) {
  if (typeof content === "string") return content
  return content.map((part) => part.type === "text" ? part.text : "[image]").join("\n")
}

async function* readSse(response: Response, signal?: AbortSignal): AsyncGenerator<[string, Record<string, unknown>]> {
  if (!response.body) throw new Error("Provider returned no stream")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let event = "message"
  let data = ""
  const flush = async function* () {
    if (!data) return
    try { yield [event, JSON.parse(data) as Record<string, unknown>] as [string, Record<string, unknown>] } catch {}
    event = "message"
    data = ""
  }
  while (true) {
    if (signal?.aborted) { await reader.cancel(); return }
    const next = await reader.read()
    if (next.done) break
    buffer += decoder.decode(next.value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const raw of lines) {
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw
      if (line.startsWith("event:")) event = line.slice(6).trim()
      else if (line.startsWith("data:")) data += line.slice(5).trim()
      else if (!line.trim()) yield* flush()
    }
  }
  if (buffer.trim()) for (const raw of buffer.split("\n")) if (raw.startsWith("data:")) data += raw.slice(5).trim()
  yield* flush()
}

export function createProviderTransport(provider: ProviderCredentialProvider, apiKey: string): DurableChatTransport {
  return (async function* ({ messages, model, tools, signal }) {
    if (provider === "opencode") {
      const anthropic = /claude|anthropic/i.test(model)
      const endpoint = anthropic ? "https://opencode.ai/inference/anthropic/v1/messages" : "https://opencode.ai/inference/openai/v1/chat/completions"
      const body = anthropic
        ? { model, stream: true, max_tokens: 16_384, system: messages.filter((message) => message.role === "system").map((message) => textOf(message.content)).join("\n\n") || undefined, messages: messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role === "tool" ? "user" : message.role, content: textOf(message.content) })) }
        : { model, stream: true, messages, tools: tools?.length ? tools : undefined }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify(body),
        signal,
      })
      if (!response.ok) throw new Error(`OpenCode Go returned HTTP ${response.status}`)
      let usage: Record<string, unknown> | undefined
      yield { type: "status", phase: "streaming", message: "OpenCode Go is responding" }
      for await (const [event, data] of readSse(response, signal)) {
        const choices = Array.isArray(data.choices) ? data.choices : []
        const delta = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>).delta : null
        if (delta && typeof delta === "object" && typeof (delta as Record<string, unknown>).content === "string") yield { type: "text", content: (delta as Record<string, string>).content }
        if (typeof data.delta === "object" && data.delta && typeof (data.delta as Record<string, unknown>).text === "string") yield { type: "text", content: (data.delta as Record<string, string>).text }
        if (data.usage && typeof data.usage === "object") usage = data.usage as Record<string, unknown>
        if (event === "error" || typeof data.error === "object") yield { type: "error", message: "OpenCode Go returned an error" }
      }
      yield { type: "finish", reason: "stop", usage }
      return
    }

    const prompt = messages.map((message) => `${message.role}: ${textOf(message.content)}`).join("\n\n")
    const create = await fetch("https://api.cursor.com/v1/agents", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: { text: prompt }, model: { id: model } }),
      signal,
    })
    if (!create.ok) throw new Error(`Cursor Cloud Agents returned HTTP ${create.status}`)
    const created = await create.json() as { agent?: { id?: string }; run?: { id?: string } }
    const agentId = created.agent?.id
    const runId = created.run?.id
    if (!agentId || !runId) throw new Error("Cursor Cloud Agents returned an invalid run")
    const stream = await fetch(`https://api.cursor.com/v1/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/stream`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: "text/event-stream" }, signal })
    if (!stream.ok) throw new Error(`Cursor Cloud Agents stream returned HTTP ${stream.status}`)
    yield { type: "status", phase: "running", message: "Cursor Cloud Agent is working" }
    for await (const [event, data] of readSse(stream, signal)) {
      if (event === "assistant" && typeof data.text === "string") yield { type: "text", content: data.text }
      else if (event === "thinking" && typeof data.text === "string") yield { type: "reasoning", content: data.text }
      else if (event === "tool_call" && typeof data.name === "string" && typeof data.callId === "string") yield { type: "tool-call", toolName: data.name, toolCallId: data.callId, args: typeof data.args === "object" && data.args ? data.args as Record<string, unknown> : {} }
      else if (event === "error") yield { type: "error", message: typeof data.message === "string" ? data.message : "Cursor Cloud Agent failed" }
      else if (event === "result" && typeof data.text === "string") yield { type: "text", content: data.text }
    }
    yield { type: "finish", reason: "stop" }
  }) as DurableChatTransport
}

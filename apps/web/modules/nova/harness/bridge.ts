import { validateArguments } from "@super/agent-runtime"
import { InteractionPending, type createDurableJournal } from "./durable"
import { terminalHarnessUrl, streamHarnessChat, type HarnessChatMessage, type HarnessChatTool, type HarnessStreamEvent } from "./client"

const VERSION = "nova-cli-harness/1"
export type BridgeEvent = HarnessStreamEvent | { type: "tool-result"; toolName: string; toolCallId: string; args: Record<string, unknown>; content: string; status: "completed" | "failed" | "denied"; message: string }
export type BridgeInput = {
  token: string
  messages: HarnessChatMessage[]
  provider: string
  model: string
  mode: "chat" | "plan" | "agent"
  budget?: number
  journal?: ReturnType<typeof createDurableJournal>
  unattended?: boolean
  approvalTools?: string[]
  tools: Array<HarnessChatTool & { access: "read" | "write" | "execute" | "state" }>
  signal?: AbortSignal
  chatTransport?: import("./client").DurableChatTransport
  execute: (name: string, args: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown>
}

/** No agent loop here: handoffs are initiated solely by the original CLI harness. */
export async function* streamOriginalHarness(input: BridgeInput): AsyncGenerator<BridgeEvent> {
  const cancellation = new AbortController()
  input = { ...input, signal: AbortSignal.any([cancellation.signal, ...(input.signal ? [input.signal] : []), AbortSignal.timeout(540_000)]) }
  input.signal?.throwIfAborted()
  if (!input.token) throw new Error("A CLI session is required to authorize the original harness bridge")
  const headers = { Authorization: `Bearer ${input.token}`, "Content-Type": "application/json", Accept: "application/x-ndjson" }
  const response = await fetch(`${terminalHarnessUrl()}/api/nova/harness/turn`, {
    method: "POST", headers, signal: input.signal, cache: "no-store", redirect: "error",
    body: JSON.stringify({ version: VERSION, mode: input.mode, messages: input.messages, tools: input.tools, budget: input.budget ?? 30 }),
  })
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new Error(`Original CLI harness bridge unavailable (HTTP ${response.status}). Deploy matching CLI server and Nova versions.`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const consumed = new Set<string>()
  const tools = new Map(input.tools.map((tool) => [tool.function.name, tool]))
  let runId = ""
  let terminal = false
  let buffer = ""
  const reply = async (event: Record<string, unknown>) => {
    const id = event.id
    if (!runId || typeof id !== "string" || consumed.has(id) || typeof event.hash !== "string") throw new Error("Invalid or replayed CLI handoff")
    consumed.add(id)
    const payload = event.payload as Record<string, unknown>
    let value: unknown
    let error: string | undefined
    try {
      if (event.kind === "inference") {
        if (!Array.isArray(payload.messages) || !Array.isArray(payload.tools)) throw new Error("Invalid inference handoff")
        for (const offered of payload.tools as HarnessChatTool[]) {
          const registered = tools.get(offered.function?.name)
          if (!registered || JSON.stringify(registered.function.parameters) !== JSON.stringify(offered.function.parameters)) throw new Error("Inference requested an unregistered capability")
        }
        const infer = async () => {
        const events: HarnessStreamEvent[] = []
        let bytes = 0
        for await (const part of (input.chatTransport ?? streamHarnessChat)({
          token: input.token, provider: input.provider, model: input.model, signal: input.signal,
          messages: payload.messages as HarnessChatMessage[], tools: payload.tools as HarnessChatTool[],
        })) {
          bytes += JSON.stringify(part).length
          if (bytes > 4_000_000 || events.length >= 10_000) throw new Error("Inference response exceeded bridge limits")
          events.push(part)
        }
        return { events, state: input.chatTransport?.checkpoint?.() }
        }
        const result = input.journal ? await input.journal.inference({ ...payload, provider: input.provider, model: input.model }, infer) : await infer()
        if (result.state !== undefined) input.chatTransport?.restore?.(result.state)
        value = result.events
      } else if (event.kind === "tool") {
        const name = String(payload.toolName)
        const tool = tools.get(name)
        if (!tool || (input.mode !== "agent" && !["read", "state"].includes(tool.access))) value = { success: false, denied: true, error: "Tool unavailable in this mode" }
        else {
          const args = validateArguments(tool.function.parameters, payload.args) as Record<string, unknown>
          const execute = () => input.execute(name, args, input.signal)
          value = input.journal ? await input.journal.tool(name, args, input.approvalTools?.includes(name) ?? false, input.unattended ?? false, execute) : await execute()
        }
      } else throw new Error("Unknown CLI handoff")
    } catch (failure) {
      if (input.journal || failure instanceof InteractionPending) throw failure
      input.signal?.throwIfAborted()
      error = failure instanceof Error ? failure.message.slice(0, 1000) : "Handoff failed"
    }
    const result = await fetch(`${terminalHarnessUrl()}/api/nova/harness/${encodeURIComponent(runId)}/reply`, {
      method: "POST", headers, body: JSON.stringify({ id, hash: event.hash, value: value ?? null, ...(error ? { error } : {}) }),
      signal: input.signal, cache: "no-store", redirect: "error",
    })
    await result.body?.cancel()
    if (!result.ok) throw new Error(`CLI harness handoff rejected (HTTP ${result.status})`)
  }
  try {
    while (true) {
      input.signal?.throwIfAborted()
      const next = await reader.read()
      buffer += decoder.decode(next.value, { stream: !next.done })
      if (buffer.length > 8_000_000) throw new Error("CLI harness event exceeded limits")
      const lines = buffer.split("\n")
      buffer = next.done ? "" : lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as Record<string, unknown>
        if (event.type === "bridge") {
          if (runId || event.version !== VERSION || typeof event.runId !== "string") throw new Error("Incompatible CLI harness bridge")
          runId = event.runId
        } else if (event.type === "handoff") {
          if (terminal) throw new Error("Handoff after terminal outcome")
          await reply(event)
        }
        else if (event.type === "error") throw new Error(String(event.message ?? "CLI harness failed"))
        else if (event.type === "finish") {
          if (terminal || !runId) throw new Error("Invalid CLI terminal event")
          terminal = true
          yield event as BridgeEvent
        } else if (!terminal) yield event as BridgeEvent
      }
      if (next.done) break
    }
    if (!terminal) throw new Error("CLI harness stream ended without a terminal outcome")
  } finally {
    cancellation.abort()
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}

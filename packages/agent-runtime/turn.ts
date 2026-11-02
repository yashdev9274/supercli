import { emptyResultsNotice, isEmptyToolResult, repetitionNotice, ToolCallRepetitionGuard } from "./tool-result"
import type { AgentEvent, AgentRunInput, AgentTool, ToolOutcome } from "./types"

export function toolAllowed(mode: string, tool: AgentTool): boolean {
  return tool.access === "read" || tool.access === "state" || mode === "agent"
}

export function normalizeOutcome(value: unknown): ToolOutcome {
  let parsed = value
  if (typeof value === "string") {
    try { parsed = JSON.parse(value) } catch { /* Plain text is a valid tool result. */ }
  }
  if (parsed && typeof parsed === "object") {
    const result = parsed as Record<string, unknown>
    if (result.denied === true || result.cancelled === true) return { status: "denied", value }
    if (result.success === false || result.successful === false || result.error) return { status: "failed", value }
  }
  return { status: "completed", value }
}

/** Owns continuation and tool execution. Transports MUST perform inference only. */
export async function* streamAgentTurn(input: AgentRunInput): AsyncGenerator<AgentEvent> {
  input.signal?.throwIfAborted()
  const limits = { rounds: 50, calls: 200, resultChars: 24_000, contextChars: 192_000, ...input.limits }
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new Error("Invalid agent budget")
  }
  const mode = input.mode ?? "agent"
  const messages = structuredClone(input.messages)
  const tools = new Map<string, AgentTool>()
  for (const tool of input.tools) {
    const name = tool.schema.function.name
    if (tools.has(name)) throw new Error(`Duplicate agent tool: ${name}`)
    tools.set(name, tool)
  }
  const schemas = input.tools.filter((tool) => toolAllowed(mode, tool)).map((tool) => tool.schema)
  const repetitions = new ToolCallRepetitionGuard()
  let callsUsed = 0
  let contextChars = 0
  let previousText = false
  const usage: Record<string, number> = {}

  for (let round = 0; round < limits.rounds; round++) {
    input.signal?.throwIfAborted()
    const calls: Array<Extract<AgentEvent, { type: "tool-call" }>> = []
    let text = ""
    let reason: string | undefined
    for await (const event of input.transport({ messages, tools: schemas.length ? schemas : undefined, signal: input.signal })) {
      input.signal?.throwIfAborted()
      if (event.type === "error") throw new Error(event.message)
      if (event.type === "finish") {
        if (event.reason === "error") throw new Error("The harness failed before completing the response")
        reason = event.reason
        for (const [key, value] of Object.entries(event.usage ?? {})) {
          if (typeof value === "number" && Number.isFinite(value)) usage[key] = (usage[key] ?? 0) + value
        }
      } else if (event.type === "tool-call") {
        const id = `${round}_${event.toolCallId}`
        if (calls.some((call) => call.toolCallId === id)) continue
        if (callsUsed + calls.length >= limits.calls) throw new Error("Agent reached its tool-call budget. Narrow the request and try again.")
        const call = { ...event, toolCallId: id }
        calls.push(call)
        yield call
      } else {
        if (event.type === "text") {
          if (!text && previousText) yield { type: "text", content: "\n\n" }
          text += event.content
        }
        yield event
      }
    }
    previousText ||= Boolean(text)
    if (!calls.length) {
      if (reason === "tool_calls" || reason === "tool-calls") throw new Error("The harness requested tools without returning a complete tool call")
      if (!text.trim()) throw new Error("Harness returned an empty response")
      yield { type: "finish", reason: reason ?? "stop", usage }
      return
    }
    messages.push({
      role: "assistant", content: text,
      tool_calls: calls.map((call) => ({ id: call.toolCallId, type: "function", function: { name: call.toolName, arguments: JSON.stringify(call.args) } })),
    })
    const results: Array<{ toolName: string; result: string }> = []
    let allFailed = true
    for (const call of calls) {
      input.signal?.throwIfAborted()
      callsUsed++
      const tool = tools.get(call.toolName)
      let outcome: ToolOutcome
      if (repetitions.record(call.toolName, call.args)) {
        outcome = { status: "denied", value: { successful: false, denied: true, error: "Repeated identical tool call blocked. Change the query or ask the user for clarification." } }
        messages.push({ role: "system", content: repetitionNotice() })
      } else if (!tool || !toolAllowed(mode, tool) || (input.authorize && !await input.authorize(tool, call.args))) {
        outcome = { status: "denied", value: { successful: false, denied: true, error: "Tool unavailable or permission denied for this run and mode" } }
      } else {
        yield { type: "status", phase: "tool", message: `Using ${call.toolName}` }
        try {
          outcome = normalizeOutcome(await tool.execute(call.args, { signal: input.signal, callId: call.toolCallId }))
        } catch (error) {
          input.signal?.throwIfAborted()
          outcome = { status: "failed", value: { successful: false, error: error instanceof Error ? error.message : "Tool failed" } }
        }
      }
      input.signal?.throwIfAborted()
      let content = typeof outcome.value === "string" ? outcome.value : JSON.stringify(outcome.value) ?? "null"
      if (content.length > limits.resultChars) content = JSON.stringify({ successful: outcome.status === "completed", truncated: true, data: content.slice(0, limits.resultChars) })
      contextChars += content.length
      if (contextChars > limits.contextChars) throw new Error("Agent reached its tool-result context budget. Narrow the request and try again.")
      messages.push({ role: "tool", tool_call_id: call.toolCallId, content })
      results.push({ toolName: call.toolName, result: content })
      if (outcome.status === "completed" && !isEmptyToolResult(content)) allFailed = false
      yield {
        type: "tool-result", toolName: call.toolName, toolCallId: call.toolCallId,
        status: outcome.status, content, args: call.args,
        message: input.describeResult?.(call.toolName, call.args, outcome) ?? `${call.toolName} ${outcome.status}`,
      }
    }
    if (allFailed) messages.push({ role: "system", content: emptyResultsNotice(results) })
    if (round === limits.rounds - 2) messages.push({ role: "system", content: "SYSTEM NOTICE: One round remains. Finish using the evidence already collected; do not invent actions or results." })
  }
  throw new Error("Agent reached its tool-step budget. Narrow the request and try again.")
}

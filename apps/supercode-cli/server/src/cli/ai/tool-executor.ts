/**
 * Local multi-step tool loop for BYOK / AI-SDK providers.
 *
 * One streamText call per step (maxSteps: 1), then local tool execution.
 * Shares empty/denial/repetition guards with the cloud proxy path.
 */
import { streamText, type ModelMessage, type ToolSet } from "ai"
import { z } from "zod"
import {
  DenialLoopGuard,
  ToolCallRepetitionGuard,
  denialLoopNotice,
  emptyResultsNotice,
  isEmptyToolResult,
  isZodError,
  repetitionNotice,
  runToolExecute,
} from "./tool-result"
import { parseStreamedContent, KNOWN_TOOL_NAMES } from "src/lib/embedded-tool-calls"

export interface ToolExecutorCallbacks {
  onChunk?: (chunk: string) => void
  onToolCall?: (params: { toolName: string; args: Record<string, unknown> }) => void
  onReasoning?: (chunk: string) => void
  onToolResult?: (params: { toolName: string; args: unknown; result: string }) => void
  signal?: AbortSignal
  onStepFinish?: (params: {
    stepNumber: number
    toolCalls: Array<{ toolName: string; args: unknown }>
    toolResults: Array<{ toolName: string; args: unknown; result: string }>
  }) => void
}

export type ToolSetDefinition = Record<
  string,
  {
    description?: string
    parameters?: z.ZodType<any> | Record<string, unknown>
    inputSchema?: z.ZodType<any> | Record<string, unknown>
    execute?: (args: any) => Promise<string>
  }
>

function asToolDefs(tools: ToolSet | undefined): ToolSetDefinition | null {
  if (!tools || typeof tools !== "object") return null
  const out: ToolSetDefinition = {}
  for (const [key, val] of Object.entries(tools)) {
    out[key] = val as any
  }
  return out
}

type PendingCall = {
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
}

function pushUniqueCall(
  list: PendingCall[],
  seen: Set<string>,
  toolName: string,
  args: Record<string, unknown>,
  toolCallId?: string,
) {
  const key = `${toolName}:${JSON.stringify(args)}`
  if (seen.has(key)) return
  seen.add(key)
  list.push({
    toolCallId: toolCallId || `call_embedded_${Date.now()}_${list.length}`,
    toolName,
    args,
  })
}

async function drainReasoning(result: any, onReasoning?: (chunk: string) => void) {
  if (!onReasoning) return
  const stream = result?.reasoningStream || result?.reasoningText
  if (!stream || typeof stream !== "object") {
    if (typeof stream === "string" && stream.length > 0) onReasoning(stream)
    return
  }
  try {
    if (Symbol.asyncIterator in stream) {
      for await (const chunk of stream) {
        onReasoning(typeof chunk === "string" ? chunk : String(chunk))
      }
    }
  } catch {
    // reasoning stream may not be supported
  }
}

function collectStructuredCalls(fullResult: any, list: PendingCall[], seen: Set<string>) {
  const steps = fullResult?.steps
  if (!Array.isArray(steps)) return
  for (const step of steps) {
    if (!step?.toolCalls?.length) continue
    for (const tc of step.toolCalls) {
      const args = (tc.args || (tc as any).input || {}) as Record<string, unknown>
      pushUniqueCall(list, seen, tc.toolName, args, tc.toolCallId)
    }
  }
}

export async function executeToolLoop(
  model: any,
  initialMessages: ModelMessage[],
  system: string | undefined,
  tools: ToolSet | undefined,
  callbacks: ToolExecutorCallbacks,
  maxIterations = 8,
): Promise<{ content: string; usage: Promise<any> }> {
  const functions = asToolDefs(tools)
  let messages = [...initialMessages]

  let accumulatedContent = ""
  let accumulatedUsage: any = {}
  const allToolResults: Array<{ toolName: string; result: string }> = []
  const denialGuard = new DenialLoopGuard()
  const repetitionGuard = new ToolCallRepetitionGuard()
  let stopForDenialLoop = false
  let stopForRepetition = false

  for (let iter = 0; iter < maxIterations; iter++) {
    if (callbacks.signal?.aborted) throw new DOMException("Aborted", "AbortError")

    if (stopForRepetition) {
      ;(messages as any).push({ role: "system", content: repetitionNotice() })
      break
    }

    if (accumulatedContent) callbacks.onChunk?.("\n\n")

    const streamOptions: any = {
      model,
      messages,
      abortSignal: callbacks.signal,
      maxSteps: 1,
    }
    if (system) streamOptions.system = system
    if (tools && Object.keys(tools).length > 0) streamOptions.tools = tools

    const result = streamText(streamOptions)

    // Recover MiniMax/Kimi-style inline tool descriptors that leak into textStream.
    const known = new Set(KNOWN_TOOL_NAMES)
    if (functions) {
      for (const name of Object.keys(functions)) known.add(name)
    }
    const embedded = parseStreamedContent({ knownTools: known })
    const embeddedCalls: Array<{ name: string; args: Record<string, unknown>; id: string }> = []

    const processText = async () => {
      for await (const chunk of result.textStream) {
        const blk = embedded.push(String(chunk))
        if (blk.text) {
          accumulatedContent += blk.text
          callbacks.onChunk?.(blk.text)
        }
        if (blk.calls.length) embeddedCalls.push(...blk.calls)
      }
    }

    await Promise.all([drainReasoning(result as any, callbacks.onReasoning), processText()])

    const flushed = embedded.flush()
    if (flushed.text) {
      accumulatedContent += flushed.text
      callbacks.onChunk?.(flushed.text)
    }
    if (flushed.calls.length) embeddedCalls.push(...flushed.calls)

    const toolCalls: PendingCall[] = []
    const seenToolKeys = new Set<string>()
    collectStructuredCalls(result as any, toolCalls, seenToolKeys)
    for (const call of embeddedCalls) {
      pushUniqueCall(toolCalls, seenToolKeys, call.name, call.args, call.id || undefined)
    }

    if (toolCalls.length === 0) break

    ;(messages as any).push({
      role: "assistant",
      content: "",
      tool_calls: toolCalls.map((tc) => ({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
      })),
    })

    const stepResults: Array<{ toolName: string; args: unknown; result: string }> = []

    for (const tc of toolCalls) {
      callbacks.onToolCall?.({ toolName: tc.toolName, args: tc.args })

      const toolDef = functions?.[tc.toolName]
      const resultStr = await runToolExecute(toolDef?.execute, tc.toolName, tc.args)

      allToolResults.push({ toolName: tc.toolName, result: resultStr })
      stepResults.push({ toolName: tc.toolName, args: tc.args, result: resultStr })
      callbacks.onToolResult?.({ toolName: tc.toolName, args: tc.args, result: resultStr })

      if (denialGuard.record(tc.toolName, resultStr)) stopForDenialLoop = true
      if (repetitionGuard.record(tc.toolName, tc.args)) stopForRepetition = true

      ;(messages as any).push({
        role: "tool",
        content: resultStr,
        tool_call_id: tc.toolCallId,
      })
    }

    if (callbacks.onStepFinish && toolCalls.length > 0) {
      callbacks.onStepFinish({
        stepNumber: iter,
        toolCalls: toolCalls.map((tc) => ({ toolName: tc.toolName, args: tc.args })),
        toolResults: stepResults,
      })
    }

    if (stopForDenialLoop) {
      ;(messages as any).push({ role: "system", content: denialLoopNotice() })
      iter = maxIterations
    } else if (allToolResults.length > 0 && allToolResults.every((r) => isEmptyToolResult(r.result))) {
      ;(messages as any).push({ role: "system", content: emptyResultsNotice(allToolResults) })
      // One more iteration so the model can admit empty results.
      iter = maxIterations - 1
    }

    try {
      const stepUsage = await result.usage
      if (stepUsage) {
        accumulatedUsage = {
          inputTokens:
            (accumulatedUsage.inputTokens || 0) +
            ((stepUsage as any).promptTokens || (stepUsage as any).inputTokens || 0),
          outputTokens:
            (accumulatedUsage.outputTokens || 0) +
            ((stepUsage as any).completionTokens || (stepUsage as any).outputTokens || 0),
          totalTokens: (accumulatedUsage.totalTokens || 0) + (stepUsage.totalTokens || 0),
        }
      }
    } catch {
      /* usage may fail */
    }
  }

  return {
    content: accumulatedContent,
    usage: Promise.resolve(accumulatedUsage),
  }
}

// re-export for callers that previously inlined Zod checks
export { isZodError }

import { streamText, type ModelMessage, type ToolSet } from "ai"
import { z } from "zod"

export interface ToolExecutorCallbacks {
  onChunk?: (chunk: string) => void
  onToolCall?: (params: { toolName: string; args: Record<string, unknown> }) => void
  onReasoning?: (chunk: string) => void
  signal?: AbortSignal
}

export type ToolSetDefinition = Record<string, {
  description?: string
  parameters?: z.ZodType<any> | Record<string, unknown>
  execute?: (args: any) => Promise<string>
}>

function getFunctions(tools: ToolSet | undefined): ToolSetDefinition | null {
  if (!tools || typeof tools !== "object") return null
  const funcs: ToolSetDefinition = {}
  for (const [key, val] of Object.entries(tools)) {
    funcs[key] = val as any
  }
  return funcs
}

export async function executeToolLoop(
  model: any,
  initialMessages: ModelMessage[],
  system: string | undefined,
  tools: ToolSet | undefined,
  callbacks: ToolExecutorCallbacks,
): Promise<{ content: string; usage: Promise<any> }> {
  const functions = getFunctions(tools)
  const maxIterations = 25
  let messages = [...initialMessages]

  let accumulatedContent = ""
  let accumulatedUsage: any = {}

  for (let iter = 0; iter < maxIterations; iter++) {
    if (callbacks.signal?.aborted) throw new DOMException("Aborted", "AbortError")

    if (accumulatedContent) callbacks.onChunk?.("\n\n")

    const streamOptions: any = {
      model,
      messages,
      abortSignal: callbacks.signal,
      maxSteps: 1,
    }

    if (system) streamOptions.system = system
    if (tools && Object.keys(tools).length > 0) {
      streamOptions.tools = tools
    }

    const result = streamText(streamOptions)

    const processReasoning = async () => {
      const stream = (result as any).reasoningStream || (result as any).reasoningText
      if (stream && typeof stream === "object" && callbacks.onReasoning) {
        try {
          if (Symbol.asyncIterator in stream) {
            for await (const chunk of stream) {
              callbacks.onReasoning(typeof chunk === "string" ? chunk : String(chunk))
            }
          } else if (typeof stream === "string" && stream.length > 0) {
            callbacks.onReasoning(stream)
          }
        } catch {
          // reasoning stream may not be supported
        }
      }
    }

    const processText = async () => {
      for await (const chunk of result.textStream) {
        accumulatedContent += chunk
        callbacks.onChunk?.(chunk)
      }
    }

    await Promise.all([processReasoning(), processText()])

    const fullResult = result as any
    let toolCalls: Array<{ toolCallId: string; toolName: string; args: Record<string, unknown> }> = []
    let toolResults: Array<{ toolCallId: string; toolName: string; args: any; result: any }> = []

    if (fullResult.steps && Array.isArray(fullResult.steps)) {
      for (const step of fullResult.steps) {
        if (step.toolCalls && step.toolCalls.length > 0) {
          for (const tc of step.toolCalls) {
            const args = tc.args || (tc as any).input || {}
            toolCalls.push({
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              args: args as Record<string, unknown>,
            })
          }
        }
        if (step.toolResults && step.toolResults.length > 0) {
          toolResults.push(...step.toolResults)
        }
      }
    }

    if (toolCalls.length === 0) {
      break
    }

    ;(messages as any).push({
      role: "assistant",
      content: "",
      tool_calls: toolCalls.map((tc) => ({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args,
      })),
    })

    // Execute each tool call
    for (const tc of toolCalls) {
      callbacks.onToolCall?.({ toolName: tc.toolName, args: tc.args })

      const toolDef = functions?.[tc.toolName]
      let resultStr: string
      if (toolDef?.execute) {
        try {
          resultStr = await toolDef.execute(tc.args)
        } catch (err: any) {
          resultStr = `Error: ${err.message || String(err)}`
        }
      } else {
        resultStr = `Tool "${tc.toolName}" is not available locally`
      }

      ;(messages as any).push({
        role: "tool",
        content: resultStr,
        tool_call_id: tc.toolCallId,
      })
    }

    // Merge usage data from this iteration
    try {
      const stepUsage = await result.usage
      if (stepUsage) {
        accumulatedUsage = {
          inputTokens: (accumulatedUsage.inputTokens || 0) + ((stepUsage as any).promptTokens || (stepUsage as any).inputTokens || 0),
          outputTokens: (accumulatedUsage.outputTokens || 0) + ((stepUsage as any).completionTokens || (stepUsage as any).outputTokens || 0),
          totalTokens: (accumulatedUsage.totalTokens || 0) + (stepUsage.totalTokens || 0),
        }
      }
    } catch { /* usage may fail */ }
  }

  return {
    content: accumulatedContent,
    usage: Promise.resolve(accumulatedUsage),
  }
}

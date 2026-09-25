import type { FinishReason, LanguageModel, LanguageModelUsage, ModelMessage } from "ai"

export type SendMessageResult = {
  content: string
  finishReason: FinishReason
  usage: LanguageModelUsage
}

export type ToolCallCallback = (params: {
  toolName: string
  args: Record<string, unknown>
}) => void

export type ToolResultCallback = (params: {
  toolName: string
  args: unknown
  result: string
}) => void

export type StepFinishCallback = (params: {
  stepNumber: number
  toolCalls: Array<{ toolName: string; args: unknown }>
  toolResults: Array<{ toolName: string; args: unknown; result: string }>
}) => void

export type SendMessageArgs = {
  messages: ModelMessage[]
  onChunk?: (chunk: string) => void
  tools?: unknown
  onToolCall?: ToolCallCallback
  signal?: AbortSignal
  onReasoning?: (chunk: string) => void
  onToolResult?: ToolResultCallback
  onStepFinish?: StepFinishCallback
  onStepBudget?: (maxSteps: number) => void
}

/** Uniform surface every provider service must satisfy. */
export type ProviderAdapter = {
  readonly name: string
  readonly modelName: string
  readonly model?: LanguageModel
  sendMessage(args: SendMessageArgs): Promise<SendMessageResult>
  getMessage?(messages: ModelMessage[], tools?: unknown): Promise<string>
  generateObject?(schema: unknown, prompt: string): Promise<{ object: unknown }>
  generateStructured?(schema: unknown, prompt: string): Promise<unknown>
}

/** Positional sendMessage used by legacy createProvider / chat callers. */
export type LegacySendMessage = (
  messages: ModelMessage[],
  onChunk?: (chunk: string) => void,
  tools?: any,
  onToolCall?: any,
  signal?: AbortSignal,
  onReasoning?: (chunk: string) => void,
  onToolResult?: ToolResultCallback,
  onStepFinish?: StepFinishCallback,
  onStepBudget?: (maxSteps: number) => void,
) => Promise<SendMessageResult>

export function toLegacySendMessage(
  send: (args: SendMessageArgs) => Promise<SendMessageResult>,
): LegacySendMessage {
  return (
    messages,
    onChunk,
    tools,
    onToolCall,
    signal,
    onReasoning,
    onToolResult,
    onStepFinish,
    onStepBudget,
  ) =>
    send({
      messages,
      onChunk,
      tools,
      onToolCall,
      signal,
      onReasoning,
      onToolResult,
      onStepFinish,
      onStepBudget,
    })
}

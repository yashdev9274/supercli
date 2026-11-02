export type AgentMode = "chat" | "plan" | "agent"
export type AgentContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string }
  | { type: "image_url"; image_url: { url: string } }

export type AgentMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string | AgentContentPart[]
  tool_call_id?: string
  tool_calls?: unknown
}

export type AgentToolSchema = {
  type: "function"
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type ProviderEvent =
  | { type: "status"; phase?: string; message: string }
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool-call"; toolName: string; toolCallId: string; args: Record<string, unknown> }
  | { type: "finish"; reason?: string; usage?: Record<string, unknown> }
  | { type: "error"; message: string }

export type ToolOutcome = {
  status: "completed" | "failed" | "denied"
  value: unknown
  message?: string
}

export type AgentEvent = ProviderEvent | {
  type: "tool-result"
  toolName: string
  toolCallId: string
  status: ToolOutcome["status"]
  message: string
  /** Full bounded result for persistence and terminal adapters. */
  content: string
  args: Record<string, unknown>
}

export type ProviderInput = {
  messages: AgentMessage[]
  tools?: AgentToolSchema[]
  signal?: AbortSignal
}
export type AgentTransport = (input: ProviderInput) => AsyncGenerator<ProviderEvent>

export type AgentTool = {
  schema: AgentToolSchema
  access: "read" | "write" | "execute" | "state"
  execute: (args: Record<string, unknown>, context: { signal?: AbortSignal; callId: string }) => Promise<unknown>
}

export type AgentRunInput = {
  messages: AgentMessage[]
  transport: AgentTransport
  tools: AgentTool[]
  mode?: AgentMode
  signal?: AbortSignal
  authorize?: (tool: AgentTool, args: Record<string, unknown>) => Promise<boolean>
  limits?: Partial<{ rounds: number; calls: number; resultChars: number; contextChars: number }>
  describeResult?: (toolName: string, args: Record<string, unknown>, outcome: ToolOutcome) => string
}

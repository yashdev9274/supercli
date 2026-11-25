export type HarnessStreamEvent =
  | { type: "status"; phase?: string; message: string }
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool-call"; toolName: string; toolCallId: string; args: Record<string, unknown> }
  | { type: "finish"; reason?: string; usage?: Record<string, unknown> }
  | { type: "error"; message: string }

export type HarnessChatContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string }
  | { type: "image_url"; image_url: { url: string } }

export type HarnessChatMessage = {
  role: "system" | "user" | "assistant" | "tool"
  /** Plain string, or multimodal parts (text + images) for vision models. */
  content: string | HarnessChatContentPart[]
  tool_call_id?: string
  tool_calls?: unknown
}

export type DurableChatTransport = ((input: { token: string; messages: HarnessChatMessage[]; provider: string; model: string; tools?: HarnessChatTool[]; signal?: AbortSignal }) => AsyncGenerator<HarnessStreamEvent>) & {
  checkpoint?: () => unknown
  restore?: (state: unknown) => void
}

export type HarnessChatTool = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type ChatTransport = DurableChatTransport

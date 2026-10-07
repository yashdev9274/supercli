export type HarnessStreamEvent =
  | { type: "status"; phase?: string; message: string }
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tool-call"; toolName: string; toolCallId: string; args: Record<string, unknown> }
  | { type: "finish"; reason?: string; usage?: Record<string, unknown> }
  | { type: "error"; message: string }

export type HarnessChatMessage = {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  tool_call_id?: string
  tool_calls?: unknown
}

export type HarnessChatTool = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

function terminalHarnessUrl() {
  return (
    process.env.SUPERCODE_TERMINAL_API_URL
    || process.env.TERMINAL_SERVER_URL
    || process.env.NEXT_PUBLIC_TERMINAL_URL
    || (process.env.NODE_ENV === "production"
      ? "https://supercode-8w7e.onrender.com"
      : "http://localhost:3004")
  ).replace(/\/$/, "")
}

function parseEvent(line: string): HarnessStreamEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let object: Record<string, unknown>
  try {
    object = JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return null
  }
  const type = typeof object.type === "string" ? object.type : ""
  switch (type) {
    case "text":
      return { type: "text", content: typeof object.content === "string" ? object.content : "" }
    case "reasoning":
      return {
        type: "reasoning",
        content: typeof object.content === "string" ? object.content : "",
      }
    case "status":
      return {
        type: "status",
        phase: typeof object.phase === "string" ? object.phase : undefined,
        message:
          typeof object.message === "string"
            ? object.message
            : typeof object.status === "string"
              ? object.status
              : "Working",
      }
    case "tool-call": {
      const toolName =
        (typeof object.toolName === "string" && object.toolName)
        || (typeof object.name === "string" && object.name)
        || "tool"
      const toolCallId =
        (typeof object.toolCallId === "string" && object.toolCallId)
        || crypto.randomUUID()
      const raw = object.args ?? object.arguments ?? {}
      let args: Record<string, unknown> = {}
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        args = raw as Record<string, unknown>
      } else if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw) as unknown
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            args = parsed as Record<string, unknown>
          }
        } catch {
          args = { raw }
        }
      }
      return { type: "tool-call", toolName, toolCallId, args }
    }
    case "finish":
      return {
        type: "finish",
        reason:
          typeof object.reason === "string"
            ? object.reason
            : typeof object.finishReason === "string"
              ? object.finishReason
              : undefined,
        usage:
          object.usage && typeof object.usage === "object" && !Array.isArray(object.usage)
            ? object.usage as Record<string, unknown>
            : undefined,
      }
    case "error":
      return {
        type: "error",
        message:
          typeof object.message === "string"
            ? object.message
            : typeof object.error === "string"
              ? object.error
              : "Harness stream error",
      }
    default:
      return null
  }
}

/**
 * Stream NDJSON chat events from the CLI harness (`POST /api/ai/chat`),
 * the same endpoint Supercode Desktop uses.
 */
export async function* streamHarnessChat(input: {
  token: string
  messages: HarnessChatMessage[]
  provider: string
  model: string
  tools?: HarnessChatTool[]
  signal?: AbortSignal
}): AsyncGenerator<HarnessStreamEvent> {
  const url = `${terminalHarnessUrl()}/api/ai/chat`
  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.token}`,
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
        "X-Supercode-Client": "nova-web",
        "User-Agent": "Nova Web",
      },
      body: JSON.stringify({
        messages: input.messages,
        provider: input.provider,
        model: input.model,
        ...(input.tools?.length ? { tools: input.tools } : {}),
      }),
      signal: input.signal,
      cache: "no-store",
    })
  } catch (error) {
    yield {
      type: "error",
      message:
        error instanceof Error
          ? `Harness unreachable at ${url}: ${error.message}`
          : `Harness unreachable at ${url}`,
    }
    return
  }

  if (response.status === 401) {
    yield {
      type: "error",
      message:
        "Harness rejected the session token. Nova could not authorize against the CLI server — check DATABASE_URL_TERMINAL matches the terminal server, then retry.",
    }
    return
  }

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "")
    yield {
      type: "error",
      message: body.slice(0, 500) || `Harness returned HTTP ${response.status}`,
    }
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const event = parseEvent(line)
      if (event) yield event
    }
  }

  const tail = buffer.trim()
  if (tail) {
    const event = parseEvent(tail)
    if (event) yield event
  }
}

export { terminalHarnessUrl }

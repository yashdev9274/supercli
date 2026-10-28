import { readResponsesSSE } from "../chatgpt/sse"
import type { CompletedResponse, ResponseItem } from "../chatgpt/responses"
import type { ChatTransport } from "../harness/agent"
import { codexAccountId, createCodexCredentials, type CodexCredentialContext } from "./credentials"
import { parseCodexModels, validateCodexSelection } from "./models"
import { boundedJson, CodexError, refreshCodexTokens } from "./provider"

const BASE = "https://chatgpt.com/backend-api/codex"
// Catalog protocol pinned to openai/codex; version is a protocol compatibility hint.
const CLIENT_VERSION = "0.134.0"

export function createCodexRuntime(context: CodexCredentialContext, fetcher: typeof fetch = fetch) {
  const credentials = createCodexCredentials(context, (tokens) => refreshCodexTokens(tokens, fetcher))
  async function request(path: "/models" | "/responses", body: unknown, signal: AbortSignal): Promise<Response> {
    let credential = await credentials.read(signal)
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted()
      const account = codexAccountId(credential.tokens)
      let response: Response
      try {
        response = await fetcher(`${BASE}${path}${path === "/models" ? `?client_version=${CLIENT_VERSION}` : ""}`, {
          method: body ? "POST" : "GET",
          headers: {
            Authorization: `Bearer ${credential.tokens.access_token}`,
            Accept: body ? "text/event-stream" : "application/json",
            "Content-Type": "application/json",
            originator: "codex_cli_rs",
            "User-Agent": `codex_cli_rs/${CLIENT_VERSION} (Nova Web)`,
            ...(account ? { "ChatGPT-Account-Id": account } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          redirect: "error", cache: "no-store", signal,
        })
      } catch {
        signal.throwIfAborted()
        throw new CodexError("Could not contact Codex. Please retry.")
      }
      if (response.status === 401 && attempt === 0) {
        await response.body?.cancel()
        credential = await credentials.rotate(credential, signal)
        continue
      }
      if (!response.ok) {
        await response.body?.cancel()
        throw new CodexError(response.status === 401 ? "Reconnect Codex in Settings → Models."
          : response.status === 429 ? "Codex usage limit reached. Check your ChatGPT plan or retry later."
            : response.status === 403 ? "Your Codex account cannot access this request. Check your ChatGPT workspace."
              : `Codex returned HTTP ${response.status}. Refresh the model list or retry.`, response.status === 401 ? 401 : response.status === 429 ? 429 : 502)
      }
      return response
    }
    throw new CodexError("Reconnect Codex in Settings → Models.", 401)
  }
  async function catalog(signal?: AbortSignal) {
    const deadline = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(20_000)])
    const response = await request("/models", undefined, deadline)
    try { return parseCodexModels(await boundedJson(response, 2_097_152)) }
    catch { throw new CodexError("Codex returned an invalid model catalog. Please retry.") }
  }
  async function prepare(model: string | undefined, effort?: string, signal?: AbortSignal): Promise<ChatTransport> {
    let entry
    try { entry = validateCodexSelection(await catalog(signal), model, effort) }
    catch (error) {
      if (error instanceof CodexError) throw error
      throw new CodexError(error instanceof Error ? error.message : "Invalid Codex selection", 400)
    }
    const selectedEffort = effort ?? entry.defaultEffort
    // Private per-turn state: preserve complete native reasoning and function-call items.
    let items: ResponseItem[] = []
    let completed: CompletedResponse | undefined
    let consumed = 0
    let round = 0
    return async function* transport(input) {
      const deadline = AbortSignal.any([...(input.signal ? [input.signal] : []), AbortSignal.timeout(180_000)])
      if (!completed) {
        items = input.messages.filter((message) => message.role !== "system").map((message) => {
          if (message.role === "tool" || message.tool_calls || typeof message.content !== "string") throw new CodexError("Invalid Codex conversation")
          return { role: message.role, content: message.content }
        })
      } else {
        const results = input.messages.slice(consumed).filter((message) => message.role === "tool")
        if (results.length !== completed.calls.length || completed.calls.some((call) => !results.some((result) => result.tool_call_id === `${round - 1}_${call.id}`))) {
          throw new CodexError("Codex tool continuation did not match pending calls")
        }
        items = [...items, ...completed.output, ...results.map((result) => ({
          type: "function_call_output", call_id: result.tool_call_id!.slice(String(round - 1).length + 1), output: result.content,
        }))]
      }
      consumed = input.messages.length
      const tools = input.tools?.map(({ function: tool }) => ({ type: "function", ...tool, strict: false })) ?? []
      if (tools.some((tool) => !/^[A-Za-z0-9_-]{1,64}$/.test(tool.name))) throw new CodexError("Invalid Codex tool name")
      const body = {
        model: entry.id, store: false, stream: true,
        instructions: input.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n\n"),
        input: items, tools, tool_choice: "auto", parallel_tool_calls: false,
        include: ["reasoning.encrypted_content"],
        ...(selectedEffort ? { reasoning: { effort: selectedEffort, summary: "auto" } } : {}),
      }
      const response = await request("/responses", body, deadline)
      if (!response.body || !response.headers.get("content-type")?.includes("text/event-stream")) {
        await response.body?.cancel()
        throw new CodexError("Codex did not return a response stream")
      }
      const stream = readResponsesSSE(response.body, deadline)
      while (true) {
        const next = await stream.next()
        if (next.done) { completed = next.value; break }
        yield next.value
      }
      round++
    }
  }
  return { catalog, prepare }
}

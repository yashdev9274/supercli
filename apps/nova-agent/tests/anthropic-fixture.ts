import { compatibleFixture } from "./compatible-fixture"

export function anthropicFixture() {
  const fixture = compatibleFixture("anthropic")
  fixture.config.apiFamily = "anthropic"
  fixture.config.baseUrl = "https://api.anthropic.com"
  const requests: Array<{ body: any; key: string | null; url: string }> = []
  const wire = (hasResult = false, finish = hasResult ? "end_turn" : "tool_use") => {
    const frame = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
    return frame("message_start", { message: { id: "msg_fixture", type: "message", role: "assistant", content: [], model: "fixture-model", stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } })
      + frame("content_block_start", { index: 0, content_block: hasResult ? { type: "text", text: "" } : { type: "tool_use", id: "tool_fixture", name: "runtime_info", input: {} } })
      + (hasResult
        ? frame("content_block_delta", { index: 0, delta: { type: "text_delta", text: "Anthropic verified 👋" } })
        : frame("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: "{" } }) + frame("content_block_delta", { index: 0, delta: { type: "input_json_delta", partial_json: "}" } }))
      + frame("content_block_stop", { index: 0 })
      + frame("message_delta", { delta: { stop_reason: finish, stop_sequence: null }, usage: { output_tokens: 3 } })
      + frame("message_stop", {})
  }
  const fetcher = (async (url, init) => {
    const body = JSON.parse(String(init?.body))
    requests.push({ body, key: new Headers(init?.headers).get("x-api-key"), url: String(url) })
    const hasResult = body.messages.some((message: any) => Array.isArray(message.content) && message.content.some((part: any) => part.type === "tool_result"))
    const bytes = new TextEncoder().encode(wire(hasResult))
    return new Response(new ReadableStream({ start(controller) {
      for (let index = 0; index < bytes.length; index += 7) controller.enqueue(bytes.slice(index, index + 7))
      controller.close()
    } }), { headers: { "Content-Type": "text/event-stream" } })
  }) as typeof fetch
  return { ...fixture, fetcher, requests, wire }
}

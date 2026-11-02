import { BridgeService } from "../../../../supercode-cli/server/src/nova-bridge/service"
import { BRIDGE_VERSION, startSchema } from "../../../../supercode-cli/server/src/nova-bridge/protocol"

/** Uses real worker processes, never a second agent loop or provider credentials. */
export function createBridgeFixture() {
  const service = new BridgeService()
  return async (request: Request, body: Record<string, unknown>): Promise<Response | null> => {
    const path = new URL(request.url).pathname
    if (!path.startsWith("/api/nova/harness/")) return null
    if (!request.headers.get("authorization")) return Response.json({}, { status: 401 })
    if (path === "/api/nova/harness/turn") {
      const input = startSchema.parse(body)
      let close: (() => void) | undefined
      const encoder = new TextEncoder()
      return new Response(new ReadableStream({
        start(controller) {
          const run = service.start("fixture", input,
            (event) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n")),
            () => controller.close())
          close = run.close
          controller.enqueue(encoder.encode(JSON.stringify({ type: "bridge", version: BRIDGE_VERSION, runId: run.id }) + "\n"))
          request.signal.addEventListener("abort", run.close, { once: true })
        },
        cancel() { close?.() },
      }), { headers: { "Content-Type": "application/x-ndjson" } })
    }
    const runId = path.split("/")[4]!
    return Response.json({}, { status: service.reply("fixture", runId, String(body.id), String(body.hash), body.value, typeof body.error === "string" ? body.error : undefined) ? 200 : 409 })
  }
}

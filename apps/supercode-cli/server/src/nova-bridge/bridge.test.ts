import { expect, test } from "bun:test"
import { BridgeService } from "./service"
import { BRIDGE_VERSION, type BridgeStart } from "./protocol"

const input: BridgeStart = { version: BRIDGE_VERSION, mode: "agent", budget: 3, messages: [{ role: "user", content: "Read fixture" }], tools: [{ type: "function", function: { name: "read_file", description: "Read fixture", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }, access: "read" }] }

test("isolated worker invokes original harness with paired tool continuation and single-use owner-bound replies", async () => {
  const service = new BridgeService()
  let round = 0
  const events: Record<string, unknown>[] = []
  let run: ReturnType<BridgeService["start"]>
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => { run.close(); reject(new Error("Worker timed out")) }, 10_000)
    run = service.start("owner", input, (event) => {
      events.push(event)
      if (event.type !== "handoff") return
      const payload = event.payload as Record<string, unknown>
      let value: unknown
      if (event.kind === "inference") {
        if (round++ === 0) value = [{ type: "tool-call", toolName: "read_file", toolCallId: "read", args: { path: "fixture" } }, { type: "finish", reason: "tool_calls" }]
        else {
          expect(JSON.stringify(payload.messages)).toContain("fixture content")
          expect(JSON.stringify(payload.messages)).toContain("0_read")
          value = [{ type: "text", content: "Fixture inspected." }, { type: "finish", reason: "stop", usage: { inputTokens: 5, outputTokens: 3 } }]
        }
      } else value = { success: true, data: { content: "fixture content" } }
      expect(service.reply("wrong-owner", run.id, String(event.id), String(event.hash), value)).toBe(false)
      expect(service.reply("owner", run.id, String(event.id), "wrong-hash", value)).toBe(false)
      expect(service.reply("owner", run.id, String(event.id), String(event.hash), value)).toBe(true)
      expect(service.reply("owner", run.id, String(event.id), String(event.hash), value)).toBe(false)
    }, () => { clearTimeout(timeout); resolve() })
  })
  expect(events.filter((event) => event.type === "error")).toEqual([])
  expect(events.filter((event) => event.type === "finish")).toHaveLength(1)
  expect(events.some((event) => event.type === "tool-result" && event.status === "completed")).toBe(true)
  expect(events.filter((event) => event.type === "text").map((event) => event.content).join("")).toBe("Fixture inspected.")
})

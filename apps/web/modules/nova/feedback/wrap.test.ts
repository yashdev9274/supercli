import { describe, expect, test } from "bun:test"

import { NoopNovaFeedbackRecorder } from "./recorder"
import { adaptHarnessEventToFeedback, withFeedbackRecording } from "./wrap"

async function* fakeStream<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item
}

describe("feedback wrap", () => {
  test("withFeedbackRecording yields every original event", async () => {
    const recorder = new NoopNovaFeedbackRecorder()
    const events = [
      { type: "status", phase: "executing", message: "boot" },
      { type: "text", content: "hello" },
      { type: "finish", reason: "stop" },
    ] as const
    const collected: Array<Record<string, unknown>> = []
    for await (const event of withFeedbackRecording(fakeStream([...events] as Array<Record<string, unknown>>), recorder)) {
      collected.push(event)
    }
    expect(collected.length).toBe(events.length)
    expect(collected[0]?.["type"]).toBe("status")
    expect(collected[2]?.["type"]).toBe("finish")
  })

  test("adaptHarnessEventToFeedback normalises known shapes", () => {
    expect(
      adaptHarnessEventToFeedback({ type: "status", phase: "tool", message: "shell" }),
    ).toMatchObject({ type: "status", payload: { phase: "tool", message: "shell" } })
    expect(
      adaptHarnessEventToFeedback({ type: "tool-call", toolName: "rg", toolCallId: "1", args: { q: "x" } }),
    ).toMatchObject({ type: "tool_call", payload: { toolName: "rg", toolCallId: "1" } })
    expect(
      adaptHarnessEventToFeedback({ type: "tool-result", toolName: "rg", toolCallId: "1", status: "failed", message: "boom", args: {}, content: "" }),
    ).toMatchObject({ type: "tool_result", payload: { status: "failed" } })
    expect(
      adaptHarnessEventToFeedback({ type: "text", content: "hello" }),
    ).toMatchObject({ type: "text", payload: { content: "hello" } })
    expect(
      adaptHarnessEventToFeedback({ type: "error", message: "boom" }),
    ).toMatchObject({ type: "error", payload: { message: "boom" } })
  })

  test("adaptHarnessEventToFeedback returns null for unknown types", () => {
    expect(adaptHarnessEventToFeedback({ type: "unknown" })).toBe(null)
  })
})

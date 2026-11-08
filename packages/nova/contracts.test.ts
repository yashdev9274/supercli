import { describe, expect, test } from "bun:test"
import {
  novaFeedbackBatchPayloadSchema,
  novaFeedbackCloseoutSchema,
  novaFeedbackEnvelopeSchema,
  novaFeedbackEventSchema,
  novaFeedbackEventTypeSchema,
  novaFeedbackImprovementSchema,
  novaFeedbackOpenSchema,
  novaFeedbackUserFeedbackSchema,
} from "./index"

describe("nova feedback contracts", () => {
  test("event type enumerates every harness phase", () => {
    expect(novaFeedbackEventTypeSchema.options.length).toBe(12)
  })

  test("event payload requires monotonic sequence and ts", () => {
    const valid = novaFeedbackEventSchema.safeParse({
      sequence: 1,
      ts: 1730000000000,
      type: "tool_call",
      payload: { toolName: "shell.exec" },
    })
    expect(valid.success).toBe(true)
    const invalid = novaFeedbackEventSchema.safeParse({
      sequence: -1,
      ts: 1730000000000,
      type: "tool_call",
      payload: {},
    })
    expect(invalid.success).toBe(false)
  })

  test("envelope discriminated union rejects mismatched kinds", () => {
    const parsed = novaFeedbackEnvelopeSchema.safeParse({
      contractVersion: "1",
      kind: "open",
      organizationId: "org_1",
      agentSessionId: "sess_1",
      runId: "run_1",
      title: "hello",
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.kind).toBe("open")
    }
  })

  test("open schema requires organization + title", () => {
    const bad = novaFeedbackOpenSchema.safeParse({
      contractVersion: "1",
      kind: "open",
      title: "",
    })
    expect(bad.success).toBe(false)
  })

  test("batch schema enforces 1..500 events", () => {
    const empty = novaFeedbackBatchPayloadSchema.safeParse({
      contractVersion: "1",
      kind: "batch",
      feedbackId: "fb_1",
      events: [],
    })
    expect(empty.success).toBe(false)
  })

  test("closeout requires summary + body", () => {
    const ok = novaFeedbackCloseoutSchema.safeParse({
      contractVersion: "1",
      kind: "closeout",
      feedbackId: "fb_1",
      summary: "Done",
      body: "# markdown",
      improvements: [],
      perceivedIssues: [],
      severity: "info",
    })
    expect(ok.success).toBe(true)
  })

  test("user feedback restricts rating to -1..1", () => {
    const invalid = novaFeedbackUserFeedbackSchema.safeParse({
      contractVersion: "1",
      kind: "user_feedback",
      feedbackId: "fb_1",
      rating: 7,
    })
    expect(invalid.success).toBe(false)
  })

  test("improvement shape is bounded", () => {
    const valid = novaFeedbackImprovementSchema.safeParse({ title: "x", detail: "y" })
    expect(valid.success).toBe(true)
    const tooLong = novaFeedbackImprovementSchema.safeParse({
      title: "x".repeat(201),
      detail: "y",
    })
    expect(tooLong.success).toBe(false)
  })
})

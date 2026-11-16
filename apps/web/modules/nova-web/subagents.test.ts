import { expect, test } from "bun:test"

import type { SubagentEvent } from "@/modules/nova/harness/subagent-events"
import type { TimelineActivity } from "./types"
import { collectSubagents, MAX_SUBAGENTS, MAX_SUBAGENT_MESSAGES, subagentElapsed } from "./subagents"

function childActivity(sequence: number, event: Partial<SubagentEvent> = {}, runId = "run-1"): TimelineActivity {
  return {
    kind: "activity", id: `activity-${sequence}`, sessionId: "session", runId, sequence,
    type: "subagent", status: "working", title: "Child", data: null,
    createdAt: "2026-11-14T12:00:00Z",
    body: JSON.stringify({ type: "subagent", childId: "child", index: 1, title: "Trace authentication", prompt: "Find the auth boundary", agent: "explore", provider: "openai", model: "gpt-6.1-sol", status: "working", timestamp: "2026-11-14T12:00:00Z", ...event }),
  }
}

test("orders persisted events, deduplicates IDs, and separates runs", () => {
  const first = childActivity(1, { status: "queued" })
  const last = childActivity(3, { status: "done", message: "Auth is in middleware.", timestamp: "2026-11-14T12:01:09Z" })
  const agents = collectSubagents([last, first, childActivity(2, { message: "Reading middleware" }), last, childActivity(4, {}, "run-2")])
  expect(agents).toHaveLength(2)
  expect(agents[0]?.status).toBe("done")
  expect(agents[0]?.messages.map((item) => item.message)).toEqual(["Reading middleware", "Auth is in middleware."])
  expect(subagentElapsed(agents[0]!, Date.now())).toBe("1m 9s")
  expect(agents[0]?.key).not.toBe(agents[1]?.key)
})

test("ignores ordinary tools, malformed bodies, invalid contracts and missing runs", () => {
  const activity = childActivity(1)
  expect(collectSubagents([
    { ...activity, type: "action" },
    { ...activity, id: "bad-json", body: "not json" },
    childActivity(2, { index: 9 }),
    childActivity(4, { timestamp: "not-a-date" }),
    { ...childActivity(3), runId: null },
  ])).toEqual([])
})

test("uses the live clock only for unfinished children and preserves real terminal results", () => {
  const active = collectSubagents([childActivity(1)])[0]!
  expect(subagentElapsed(active, Date.parse("2026-11-14T12:00:12Z"))).toBe("12s")
  const done = collectSubagents([childActivity(1, { status: "done", message: "Finished" })], [{ id: "run-1", status: "failed", updatedAt: "2026-11-14T12:10:00Z", createdAt: "2026-11-14T12:00:00Z", executionTarget: "none", desktopDeviceId: null }])[0]!
  expect(done.status).toBe("done")
  expect(done.interrupted).toBe(false)
  expect(subagentElapsed(done, Date.parse("2026-11-14T12:10:00Z"))).toBe("0s")
})

test("terminal parents settle queued and active children without inventing a final reply", () => {
  for (const status of ["completed", "failed", "cancelled"]) {
    const agents = collectSubagents([childActivity(1, { status: "queued" })], [{ id: "run-1", status, createdAt: "2026-11-14T12:00:00Z", updatedAt: "2026-11-14T12:00:10Z", desktopDeviceId: null, executionTarget: "none" }])
    expect(agents[0]?.status).toBe(status === "failed" ? "failed" : "cancelled")
    expect(agents[0]?.interrupted).toBe(true)
    expect(agents[0]?.messages).toEqual([])
    expect(subagentElapsed(agents[0]!, Date.now())).toBe("10s")
  }
})

test("bounds the retained child list and each transcript", () => {
  const messages = Array.from({ length: 120 }, (_, i) => childActivity(i + 1, { message: `Progress ${i}` }))
  expect(collectSubagents(messages)[0]?.messages).toHaveLength(MAX_SUBAGENT_MESSAGES)
  const children = Array.from({ length: 80 }, (_, i) => childActivity(i + 1, { childId: `child-${i}` }))
  expect(collectSubagents(children)).toHaveLength(MAX_SUBAGENTS)
})

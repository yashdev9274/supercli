import { expect, test } from "bun:test"
import type { SessionStreamEvent } from "eve/client"
import { eventCursor, projectEveEvent, type EveProjectionState } from "./projection"

const event = (type: string, data: unknown): SessionStreamEvent => ({ type, data, meta: { position: { line: 0, index: 0 }, at: "2026-11-22T00:00:00Z" } }) as SessionStreamEvent
const state = (): EveProjectionState => ({ runtimeSessionId: "remote", nextLine: 0, replyParts: {} })

test("journal cursors order source positions and reject unsafe coordinates", () => {
  expect(eventCursor("run", 2, 3) < eventCursor("run", 10, 0)).toBe(true)
  expect(() => eventCursor("run", -1, 0)).toThrow()
  expect(() => eventCursor("run", 0, 1_000_000)).toThrow()
})

test("completed parts persist the full reply without duplicating streamed deltas", () => {
  const saved = state()
  expect(projectEveEvent(event("content.delta", { partId: "part", kind: "text", delta: "hello" }), saved).event).toEqual({ type: "text", content: "hello" })
  expect(projectEveEvent(event("content.completed", { partId: "part", kind: "text", phase: "reply", value: "hello" }), saved).event).toBeUndefined()
  expect(Object.values(saved.replyParts)).toEqual(["hello"])
  expect(projectEveEvent(event("content.completed", { partId: "other", kind: "text", phase: "reply", value: "tail" }), saved).event).toEqual({ type: "text", content: "tail" })
})

test("interrupted or narration content cannot become a completed assistant reply", () => {
  const saved = state()
  projectEveEvent(event("content.completed", { partId: "a", kind: "text", phase: "reply", value: "partial", interrupted: true }), saved)
  projectEveEvent(event("content.completed", { partId: "b", kind: "text", phase: "narration", value: "working" }), saved)
  expect(saved.replyParts).toEqual({})
  expect(projectEveEvent(event("turn.settled", { outcome: "cancelled" }), saved).terminal).toBe("cancelled")
  expect(projectEveEvent(event("turn.paused", {}), saved).terminal).toBe("failed")
})

test("only runtime_info can appear as a canary capability and provider errors are not forwarded", () => {
  const saved = state()
  expect(() => projectEveEvent(event("call.requested", { capability: { kind: "tool", name: "write_file" } }), saved)).toThrow("Unexpected capability")
  expect(projectEveEvent(event("model.settled", { error: { message: "private-credential" } }), saved)).toEqual({})
  expect(JSON.stringify(projectEveEvent(event("session.ended", { error: { message: "private-credential" } }), saved))).not.toContain("private-credential")
})

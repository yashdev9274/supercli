import { describe, expect, test } from "bun:test"
import { createEventBus } from "./events.ts"
import { finalizeAnswerVsProcess } from "./stream/split-think-content.ts"

describe("createEventBus", () => {
  test("delivers events to subscribers", () => {
    const bus = createEventBus()
    const seen: string[] = []
    bus.subscribe((e) => seen.push(e.type))
    bus.emit({ type: "status", message: "hi" })
    bus.emit({ type: "text", delta: "x" })
    bus.emit({ type: "finish", text: "done" })
    expect(seen).toEqual(["status", "text", "finish"])
  })

  test("unsubscribe stops delivery", () => {
    const bus = createEventBus()
    let n = 0
    const unsub = bus.subscribe(() => {
      n++
    })
    bus.emit({ type: "status", message: "a" })
    unsub()
    bus.emit({ type: "status", message: "b" })
    expect(n).toBe(1)
  })
})

describe("runtime finalizeAnswerVsProcess", () => {
  test("process monologue never becomes Result", () => {
    const raw =
      "User wants web search about GPT-6. Need provide query. Use web_search twice. Must supply parameters."
    const { text, reasoning } = finalizeAnswerVsProcess(raw)
    expect(text).toBe("")
    expect(reasoning.length).toBeGreaterThan(0)
  })
})

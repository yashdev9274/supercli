import { act } from "react"
import { expect, test } from "bun:test"
import { testRender } from "@opentui/react/test-utils"
import { App } from "./app"
import { createEventBus } from "src/runtime/events"
import type { SessionController } from "src/cli/session/session-controller"
import { PRESENTATION_MODES, TOOL_CATEGORY_FIXTURES } from "src/cli/utils/tool-category-fixtures"

for (const mode of PRESENTATION_MODES) {
  test(`OpenTUI ${mode}: all category blocks, analysis and repeated turn IDs`, async () => {
    const bus = createEventBus()
    let turn = 0
    const session: SessionController = {
      bus, subscribe: bus.subscribe,
      getState: () => ({ provider: "fixture", model: "fixture", mode, messages: [] }),
      setMode: () => {}, setModel: () => {}, abort: () => {},
      runUserTurn: async () => {
        turn++
        bus.emit({ type: "text", delta: `Intent ${turn}.` })
        for (const [toolName] of TOOL_CATEGORY_FIXTURES) {
          const args = { path: `turn-${turn}`, command: "fixture", content: "fixture" }
          bus.emit({ type: "tool_start", toolName, args, id: toolName })
          bus.emit({ type: "tool_end", toolName, args, id: toolName, result: { success: true, data: { content: `turn-${turn}` } } })
        }
        bus.emit({ type: "text", delta: "Final answer." })
        bus.emit({ type: "finish", text: `Intent ${turn}.Final answer.`, finishReason: "stop" })
        return { text: "Final answer." }
      },
    }
    let ui!: Awaited<ReturnType<typeof testRender>>
    await act(async () => { ui = await testRender(<App session={session} mode={mode} />, { width: 120, height: 600 }) })
    try {
      await ui.flush()
      for (let turn = 1; turn <= 2; turn++) {
        await act(async () => { await ui.mockInput.typeText("fixture") })
        await act(async () => { ui.mockInput.pressEnter(); await new Promise((resolve) => setTimeout(resolve, 10)) })
        await ui.flush()
      }
      const frame = ui.captureCharFrame()
      for (const category of new Set(TOOL_CATEGORY_FIXTURES.map(([, category]) => category))) expect(frame).toContain(category)
      expect(frame).toContain("turn-1")
      expect(frame).toContain("turn-2")
      expect(frame.match(/1\. SHELL · completed/g)).toHaveLength(2)
      expect(frame.match(/ANALYSIS · running/g)).toHaveLength(4)
      expect(frame.match(/ANALYSIS · completed/g)).toHaveLength(4)
      expect(frame.match(/Final answer\./g)).toHaveLength(2)
      expect(frame).toContain("RESULT")
    } finally { await act(async () => { ui.renderer.destroy() }) }
  })
}

test("OpenTUI renders blocks, toggles details after completion, resizes and cancels without exiting", async () => {
  const bus = createEventBus()
  let aborted = false
  let finish: (() => void) | undefined
  const session: SessionController = {
    bus,
    getState: () => ({ provider: "fixture", model: "fixture", mode: "chat", messages: [] }),
    setMode: () => {}, setModel: () => {}, subscribe: bus.subscribe,
    abort: () => { aborted = true; bus.emit({ type: "finish", text: "", finishReason: "cancelled" }); finish?.() },
    runUserTurn: async () => {
      bus.emit({ type: "tool_start", id: "sleep", toolName: "run_command", args: { command: "sleep 10" } })
      await new Promise<void>((resolve) => { finish = resolve })
      return { text: "" }
    },
  }
  let ui!: Awaited<ReturnType<typeof testRender>>
  await act(async () => { ui = await testRender(<App session={session} />, { width: 100, height: 60 }) })
  try {
    await ui.flush()
    await act(async () => {
      bus.emit({ type: "reasoning", delta: "Reasoning fixture" })
      bus.emit({ type: "text", delta: "I will inspect files.\n" })
      bus.emit({ type: "tool_start", id: "read", toolName: "read_file", args: { path: "a.ts" } })
      bus.emit({ type: "tool_end", id: "read", toolName: "read_file", result: { success: true, data: { content: Array.from({ length: 10 }, (_, i) => `output-${i}`).join("\n") } } })
      bus.emit({ type: "finish", text: "I will inspect files.\n## Done\n**Verified**", finishReason: "stop" })
    })
    await ui.flush()
    let frame = ui.captureCharFrame()
    expect(frame).toContain("READ · completed")
    expect(frame).toContain("+4 lines")
    expect(frame).not.toContain("output-9")
    expect(frame.match(/I will inspect files/g)).toHaveLength(1)
    expect(frame).toContain("Verified")
    await act(async () => {
      ui.mockInput.pressKey("o", { ctrl: true })
      ui.mockInput.pressKey("t", { ctrl: true })
    })
    await ui.flush()
    frame = ui.captureCharFrame()
    expect(frame).toContain("output-9")
    expect(frame).toContain("Reasoning fixture")
    await act(async () => { ui.resize(45, 60) })
    await ui.flush()
    expect(ui.captureCharFrame()).toContain("output-9")
    await act(async () => { await ui.mockInput.typeText("run") })
    await act(async () => { ui.mockInput.pressEnter() })
    await ui.flush()
    await act(async () => {
      ui.mockInput.pressEscape()
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    await ui.flush()
    expect(aborted).toBe(true)
    expect(ui.captureCharFrame()).toContain("cancelled")
    expect(ui.captureCharFrame()).toContain("Message")
  } finally { await act(async () => { ui.renderer.destroy() }) }
})

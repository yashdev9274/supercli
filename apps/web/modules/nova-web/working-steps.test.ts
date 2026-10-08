import { expect, test } from "bun:test"

import { formatWorkDuration, reduceWorkingSteps, tickWorkingSteps } from "./working-steps"

test("formatWorkDuration matches Capy-style labels", () => {
  expect(formatWorkDuration(0)).toBe("0s")
  expect(formatWorkDuration(4_000)).toBe("4s")
  expect(formatWorkDuration(69_000)).toBe("1m 9s")
  expect(formatWorkDuration(183_000)).toBe("3m 3s")
})

test("status and reasoning build a live working log", () => {
  let steps = reduceWorkingSteps([], { type: "status", message: "Request accepted" })
  expect(steps).toHaveLength(1)
  expect(steps[0]?.label).toBe("Accepted request")

  steps = reduceWorkingSteps(steps, { type: "status", message: "Harness · supercode · deepseek-v4-flash" })
  expect(steps.at(-1)?.label).toContain("Routing")

  steps = reduceWorkingSteps(steps, { type: "reasoning", content: "Considering the file picker path" })
  expect(steps.at(-1)?.kind).toBe("thinking")
  expect(steps.at(-1)?.status).toBe("active")
  expect(steps.at(-1)?.label.startsWith("Thinking for")).toBe(true)

  steps = tickWorkingSteps(steps, (steps.at(-1)?.startedAt ?? Date.now()) + 5_000)
  expect(steps.at(-1)?.label).toBe("Thinking for 5s")

  steps = reduceWorkingSteps(steps, { type: "text" })
  expect(steps.at(-1)?.status).toBe("done")
  expect(steps.at(-1)?.label.startsWith("Thought for")).toBe(true)
})

test("consecutive file reads collapse into an explore group", () => {
  let steps = reduceWorkingSteps([], {
    type: "activity",
    activity: { type: "tool_result", title: "read_file", body: "read apps/web/home.tsx" },
  })
  steps = reduceWorkingSteps(steps, {
    type: "activity",
    activity: { type: "tool_result", title: "read_file", body: "read apps/web/thread.tsx" },
  })
  expect(steps).toHaveLength(1)
  expect(steps[0]?.kind).toBe("explore")
  expect(steps[0]?.label).toBe("Exploring 2 files")
  expect(steps[0]?.children).toHaveLength(2)
})

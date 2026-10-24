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

test("cloud patch activity identifies the actual edited path", () => {
  const steps = reduceWorkingSteps([], {
    type: "activity",
    activity: { type: "tool_result", title: "nova_sandbox_patch", body: "nova_sandbox_patch · src/index.ts · completed", status: "completed" },
  })
  expect(steps[0]?.kind).toBe("write")
  expect(steps[0]?.meta?.path).toBe("src/index.ts")
})

test("failed cloud writes and denied commands never appear as successful edits", () => {
  for (const status of ["failed", "denied"]) {
    const steps = reduceWorkingSteps([], {
      type: "activity",
      activity: { type: "tool_result", title: "nova_sandbox_write", body: "src/index.ts · failed (exit 1)", status },
    })
    expect(steps[0]?.kind).toBe("tool")
    expect(steps[0]?.label).toStartWith(status === "failed" ? "Failed" : "Denied")
    expect(steps[0]?.label).toContain("src/index.ts")
  }
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

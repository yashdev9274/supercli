import { expect, test } from "bun:test"
import { reduceWorkingSteps, type WorkingStep } from "./working-steps"

test("child status never closes or replaces the parent working process", () => {
  const steps: WorkingStep[] = [{ id: "parent", kind: "thinking", status: "active", label: "Parent task", startedAt: 1 }]
  for (const status of ["queued", "working", "done", "failed", "cancelled"]) {
    expect(reduceWorkingSteps(steps, { type: "activity", activity: {
      type: "subagent", title: "Subagent 1", body: "Child-only activity", status,
    } })).toBe(steps)
  }
})

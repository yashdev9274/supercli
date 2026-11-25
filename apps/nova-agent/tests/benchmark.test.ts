import { expect, test } from "bun:test"
import { summarizeBenchmark } from "../lib/benchmark"

test("latency summaries include failed and timed-out attempts rather than cherry-picking passes", () => {
  const samples = [100, 300, 500, 900].map((durationMs, index) => ({ scenario: "fixture", attempt: index + 1, durationMs, exitCode: index === 2 ? 1 : 0, timedOut: index === 3 }))
  expect(summarizeBenchmark(samples)).toMatchObject([{ attempts: 4, successful: 2, failed: 2, successRate: 0.5, medianMs: 400, p95Ms: 900, totalMs: 1800, costUsd: null }])
})

test("scenarios remain separate and missing live costs are not fabricated", () => {
  const result = summarizeBenchmark([{ scenario: "one", attempt: 1, durationMs: 20, exitCode: 0, timedOut: false }, { scenario: "two", attempt: 1, durationMs: 10, exitCode: null, timedOut: true }])
  expect(result).toHaveLength(2)
  expect(result[0]).toMatchObject({ successful: 1, medianMs: 20, p95Ms: 20, costUsd: null })
  expect(result[1]).toMatchObject({ successful: 0, failed: 1 })
  expect(summarizeBenchmark([])).toEqual([])
  expect(() => summarizeBenchmark([{ scenario: "bad", attempt: 1, durationMs: Number.NaN, exitCode: 0, timedOut: false }])).toThrow()
})

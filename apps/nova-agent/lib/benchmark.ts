export type BenchmarkSample = {
  scenario: string
  attempt: number
  durationMs: number
  exitCode: number | null
  timedOut: boolean
}

export function summarizeBenchmark(samples: BenchmarkSample[]) {
  const scenarios = [...new Set(samples.map((sample) => sample.scenario))]
  return scenarios.map((scenario) => {
    const rows = samples.filter((sample) => sample.scenario === scenario)
    if (rows.some((sample) => !Number.isFinite(sample.durationMs) || sample.durationMs < 0)) throw new Error("Invalid benchmark duration")
    const times = rows.map((sample) => sample.durationMs).sort((a, b) => a - b)
    const successful = rows.filter((sample) => sample.exitCode === 0 && !sample.timedOut).length
    return {
      scenario, attempts: rows.length, successful, failed: rows.length - successful,
      successRate: successful / rows.length,
      medianMs: times.length % 2 ? times[Math.floor(times.length / 2)] : (times[times.length / 2 - 1] + times[times.length / 2]) / 2,
      p95Ms: times[Math.ceil(times.length * 0.95) - 1],
      totalMs: times.reduce((sum, value) => sum + value, 0),
      costUsd: null,
      note: "Includes failed attempts; fixture overhead, not live coding-task or provider performance",
    }
  })
}

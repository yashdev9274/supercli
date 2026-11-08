import { describe, test } from "bun:test"
import { ActiveNovaFeedbackRecorder } from "./recorder"
import { NovaFeedbackClient } from "./client"
import type { NovaFeedbackEventInput } from "./types"

const ITERATIONS = 50_000

describe("recorder bench (no-op destination)", () => {
  test("record() stays under 200us median", async () => {
    const noopFetch = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch
    const recorder = new ActiveNovaFeedbackRecorder(new NovaFeedbackClient({ endpoint: "/x", fetchImpl: noopFetch, maxAttempts: 1 }))
    await recorder.open({
      organizationId: "bench",
      agentSessionId: "bench-sess",
      runId: "bench-run",
      title: "bench",
    })
    const sample: NovaFeedbackEventInput = {
      type: "tool_call",
      ts: Date.now(),
      sequence: 0,
      payload: { toolName: "shell.exec" },
    }
    const start = Bun.nanoseconds()
    for (let i = 0; i < ITERATIONS; i++) {
      recorder.record({ ...sample, sequence: i })
    }
    const elapsedNs = Bun.nanoseconds() - start
    const perCall = elapsedNs / ITERATIONS
    const perCallUs = perCall / 1000
    console.log(`[bench] record() x${ITERATIONS} = ${(elapsedNs / 1_000_000).toFixed(2)}ms total · ${perCallUs.toFixed(2)}us/call`)
    if (perCallUs > 200) {
      throw new Error(`record()/call exceeded 200us budget (${perCallUs.toFixed(2)}us)`)
    }
  })
})

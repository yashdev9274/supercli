import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import {
  ActiveNovaFeedbackRecorder,
  NoopNovaFeedbackRecorder,
} from "./recorder"
import { NovaFeedbackClient } from "./client"

const ORIGINAL_ENV = { ...process.env }

function makeRecorder(fetchImpl: typeof fetch, envToken?: string, maxAttempts = 6) {
  if (envToken) process.env.NOVA_FEEDBACK_TOKEN = envToken
  const client = new NovaFeedbackClient({ endpoint: "/api/nova/feedback", fetchImpl, token: envToken, maxAttempts })
  return new ActiveNovaFeedbackRecorder(client)
}

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("active feedback recorder", () => {
  test("buffers and posts a batch envelope", async () => {
    const calls: Array<{ body: Record<string, unknown>; auth?: string | null }> = []
    const fetchImpl = (async (input: unknown, init?: { body?: unknown; headers?: unknown }) => {
      const url = typeof input === "string" ? input : (input as { url?: string })?.url ?? ""
      if (url.includes("/api/nova/feedback")) {
        calls.push({
          body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
          auth: ((init?.headers as Record<string, string> | undefined)?.Authorization ?? null) as string | null,
        })
        return new Response(JSON.stringify({ feedbackId: "fb_42" }), { status: 201 })
      }
      return new Response("not found", { status: 404 })
    }) as unknown as typeof fetch
    const recorder = makeRecorder(fetchImpl)
    await recorder.open({
      organizationId: "org_1",
      agentSessionId: "sess_1",
      runId: "run_1",
      title: "Hello",
    })
    recorder.recordEvent("status", { phase: "executing", message: "tooling up" })
    recorder.recordEvent("tool_call", { toolName: "shell.exec", toolCallId: "t1", args: { cmd: "ls" } })
    recorder.recordEvent("tool_result", { toolName: "shell.exec", toolCallId: "t1", status: "completed", message: "ok" })
    await recorder.flushNow()
    await recorder.dispose()
    const openCall = calls.find((c) => c.body.kind === "open")
    const batchCall = calls.find((c) => c.body.kind === "batch")
    expect(openCall).toBeDefined()
    expect(batchCall).toBeDefined()
    const batchEvents = (batchCall?.body as { events?: Array<{ type: string }> }).events
    expect(batchEvents?.length).toBe(3)
    expect(batchEvents?.[0]?.type).toBe("status")
    expect(batchEvents?.[1]?.type).toBe("tool_call")
  })

  test("retries batches on 5xx then succeeds", async () => {
    let attempts = 0
    const fetchImpl = (async (input: unknown) => {
      const url = typeof input === "string" ? input : (input as { url?: string })?.url ?? ""
      if (url.includes("/api/nova/feedback")) {
        attempts += 1
        if (attempts % 2 === 1) {
          return new Response("transient", { status: 503 })
        }
        return new Response(JSON.stringify({ feedbackId: "fb_ok" }), { status: 201 })
      }
      return new Response("not found", { status: 404 })
    }) as unknown as typeof fetch
    const recorder = makeRecorder(fetchImpl, undefined, 3)
    await recorder.open({
      organizationId: "org_1",
      agentSessionId: "sess_1",
      runId: "run_1",
      title: "Retry please",
    })
    recorder.recordEvent("tool_call", { toolName: "git.read", args: {} })
    await recorder.flushNow()
    await recorder.dispose()
    expect(attempts).toBeGreaterThanOrEqual(2)
  })

  test("does not crash when fetcher throws", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down")
    }) as unknown as typeof fetch
    const recorder = makeRecorder(fetchImpl, undefined, 2)
    let threw = false
    try {
      await recorder.open({
        organizationId: "org_1",
        agentSessionId: "sess_1",
        runId: "run_1",
        title: "Network errors",
      })
      recorder.recordEvent("tool_call", { toolName: "x" })
      await recorder.flushNow()
    } catch {
      threw = true
    }
    const stats = recorder.stats()
    expect(threw).toBe(false)
    expect(stats.feedbackId).toBe(null)
    expect(stats.openPosts).toBe(0)
  })

  test("noop recorder is a true no-op", async () => {
    const recorder = new NoopNovaFeedbackRecorder()
    await recorder.open({
      organizationId: "org_1",
      agentSessionId: "sess_1",
      runId: "run_1",
      title: "noop",
    })
    recorder.recordEvent("status", { phase: "executing", message: "x" })
    await recorder.closeout({
      summary: "x",
      body: "x",
      severity: "info",
      improvements: [],
      perceivedIssues: [],
    })
    const stats = recorder.stats()
    expect(stats.openPosts).toBe(0)
    expect(stats.successes).toBe(0)
  })
})

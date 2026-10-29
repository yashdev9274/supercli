import { expect, test } from "bun:test"

import type { CodexCredentialContext } from "./credentials"
import { createCodexRuntime } from "./runtime"
import type { CodexRow } from "./service"
import type { HarnessStreamEvent } from "../harness/client"

function context(): CodexCredentialContext {
  const row: CodexRow = {
    membershipId: "test-membership", state: "connected", version: 1,
    encryptedCredentials: "synthetic", encryptedAttempt: null, attemptId: null,
    sessionHash: null, intervalSeconds: 5, expiresAt: null, nextPollAt: null,
    lastStartedAt: null, connectedAt: new Date(0),
  }
  return {
    owner: { membershipId: row.membershipId, organizationId: "test-org", userId: "test-user", sessionId: "test-session" },
    store: { get: async () => row, compareAndSwap: async () => { throw new Error("Unexpected credential mutation") } },
    vault: () => ({
      seal: () => { throw new Error("Unexpected credential mutation") },
      open: () => ({ access_token: "synthetic-access", refresh_token: "synthetic-refresh", id_token: "synthetic-id" }),
    }),
  }
}

test("catalog uses the supported client version in query and user agent", async () => {
  const fetcher = (async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    expect(url.origin).toBe("https://chatgpt.com")
    expect(url.pathname).toBe("/backend-api/codex/models")
    expect(url.searchParams.get("client_version")).toBe("0.164.0")
    expect(headers.get("User-Agent")).toBe("codex_cli_rs/0.164.0 (Nova Web)")
    expect(init?.cache).toBe("no-store")
    expect(init?.redirect).toBe("error")
    return Response.json({ models: [{ slug: "account-model", display_name: "Account Model", visibility: "list" }] })
  }) as typeof fetch
  expect((await createCodexRuntime(context(), fetcher).catalog()).map((model) => model.id)).toEqual(["account-model"])
})

test("catalog reports malformed upstream data as an error", async () => {
  const fetcher = (async () => Response.json({ unexpected: [] })) as unknown as typeof fetch
  await expect(createCodexRuntime(context(), fetcher).catalog()).rejects.toThrow("invalid model catalog")
})

const completion = { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Hello" }] }] }

async function runResponse(response: Response): Promise<HarnessStreamEvent[]> {
  const fetcher = (async (url, init) => {
    if (String(url).includes("/models?")) return Response.json({ models: [{ slug: "account-model", display_name: "Account Model", visibility: "list" }] })
    expect(new Headers(init?.headers).get("Accept")).toBe("text/event-stream")
    expect(JSON.parse(String(init?.body)).stream).toBe(true)
    return response
  }) as typeof fetch
  const transport = await createCodexRuntime(context(), fetcher).prepare("account-model")
  const events: HarnessStreamEvent[] = []
  for await (const event of transport({ token: "synthetic", provider: "codex", model: "account-model", messages: [{ role: "user", content: "Hi" }] })) events.push(event)
  return events
}

for (const contentType of [null, "application/octet-stream", "Text/Event-Stream; charset=utf-8", "text/event-stream"]) {
  test(`reads a valid SSE body with content type ${contentType}`, async () => {
    const body = `data: ${JSON.stringify({ type: "response.output_text.delta", delta: "Hello" })}\n\ndata: ${JSON.stringify({ type: "response.completed", response: completion })}\n\n`
    const response = new Response(new TextEncoder().encode(body), { headers: contentType ? { "Content-Type": contentType } : {} })
    expect(await runResponse(response)).toEqual([{ type: "text", content: "Hello" }, { type: "finish", reason: "stop" }])
  })
}

test("accepts a validated JSON completion", async () => {
  expect(await runResponse(Response.json(completion))).toEqual([{ type: "text", content: "Hello" }, { type: "finish", reason: "stop" }])
})

test("rejects HTML, truncated SSE, empty bodies and JSON errors without exposing their contents", async () => {
  for (const response of [
    new Response("<html>private upstream details</html>", { headers: { "Content-Type": "text/html" } }),
    new Response("data: {\"type\":\"response.created\"}\n\n"),
    new Response(null, { status: 204 }),
    Response.json({ error: { message: "private upstream details" } }),
    Response.json({ type: "response.failed", response: { error: { message: "private upstream details" } } }),
  ]) {
    let failure: unknown
    try { await runResponse(response) } catch (error) { failure = error }
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).not.toContain("private upstream details")
  }
})

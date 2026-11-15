import { expect, test } from "bun:test"
import type { CodexCredentialContext } from "./credentials"
import type { CodexRow } from "./service"
import { createCodexRuntime } from "./runtime"
import type { ChatTransport } from "../harness/agent"

test("fresh Codex child transports do not consume or overwrite parent continuation", async () => {
  const row: CodexRow = {
    membershipId: "fixture", state: "connected", version: 1,
    encryptedCredentials: "fixture", encryptedAttempt: null, attemptId: null,
    sessionHash: null, intervalSeconds: 5, expiresAt: null, nextPollAt: null,
    lastStartedAt: null, connectedAt: new Date(0),
  }
  const context: CodexCredentialContext = {
    owner: { membershipId: "fixture", organizationId: "fixture", userId: "fixture", sessionId: "fixture" },
    store: { get: async () => row, compareAndSwap: async () => { throw new Error("Unexpected credential change") } },
    vault: () => ({ seal: () => { throw new Error("Unexpected credential change") }, open: () => ({
      access_token: "synthetic-fixture", refresh_token: "synthetic-fixture", id_token: "synthetic-fixture",
    }) }),
  }
  const bodies: Array<{ input: Array<{ role?: string; content?: string; type?: string; call_id?: string }> }> = []
  const fetcher = (async (url, init) => {
    if (String(url).includes("/models?")) return Response.json({ models: [{ slug: "fixture-model", display_name: "Fixture", visibility: "list" }] })
    const body = JSON.parse(String(init?.body))
    bodies.push(body)
    if (bodies.length === 1) return Response.json({ status: "completed", output: [{
      type: "function_call", id: "native-parent-call", call_id: "parent-call", name: "read_file", arguments: '{"path":"parent"}',
    }] })
    return Response.json({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] }] })
  }) as typeof fetch
  const runtime = createCodexRuntime(context, fetcher)
  const parent = await runtime.prepare("fixture-model")
  const child = await runtime.prepare("fixture-model")
  expect(child).not.toBe(parent)
  const collect = async (transport: ChatTransport, messages: Parameters<ChatTransport>[0]["messages"]) => {
    for await (const event of transport({ token: "fixture", provider: "codex", model: "fixture-model", messages })) void event
  }
  await collect(parent, [{ role: "user", content: "parent task" }])
  const parentCheckpoint = structuredClone(parent.checkpoint!())
  await collect(child, [{ role: "user", content: "child task" }])
  expect(bodies[1]?.input).toEqual([{ role: "user", content: "child task" }])
  expect(parent.checkpoint!()).toEqual(parentCheckpoint)
  await collect(parent, [
    { role: "user", content: "parent task" },
    { role: "assistant", content: "" },
    { role: "tool", tool_call_id: "0_parent-call", content: "parent evidence" },
  ])
  expect(bodies[2]?.input.some((item) => item.content === "child task")).toBe(false)
  expect(bodies[2]?.input.find((item) => item.type === "function_call_output")?.call_id).toBe("parent-call")
})

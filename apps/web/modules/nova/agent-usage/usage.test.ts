import { expect, test } from "bun:test"
import type { CodexCredentialContext } from "@super/codex-runtime/credentials"
import { CodexError } from "@super/codex-runtime/provider"
import type { CodexRow } from "@super/codex-runtime/service"

import { parseCodexUsage } from "./codex"
import { agentUsageSnapshotSchema } from "./contracts"
import { agentUsageSnapshot } from "./service"

function fixture(state = "connected") {
  const row: CodexRow = {
    membershipId: "membership", state, version: 1, encryptedCredentials: "synthetic-encrypted",
    encryptedAttempt: null, attemptId: null, sessionHash: null, intervalSeconds: 5,
    expiresAt: null, nextPollAt: null, lastStartedAt: null, connectedAt: null,
  }
  let tokens = {
    access_token: "synthetic-access", refresh_token: "synthetic-refresh",
    id_token: `header.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: "account-test" } })).toString("base64url")}.signature`,
  }
  const context: CodexCredentialContext = {
    owner: { membershipId: "membership", userId: "user", organizationId: "org", sessionId: "session" },
    store: {
      get: async () => ({ ...row }),
      compareAndSwap: async (version, patch) => {
        if (version !== row.version) return false
        Object.assign(row, patch, { version: row.version + 1 })
        return true
      },
    },
    vault: () => ({
      open: () => tokens,
      seal: (value) => { tokens = value as typeof tokens; return "synthetic-rotated" },
    }),
  }
  return { context, row }
}

const payload = {
  plan_type: "plus",
  rate_limit: {
    primary_window: { used_percent: 25, limit_window_seconds: 18000, reset_at: 1800000000 },
    secondary_window: { used_percent: 100, limit_window_seconds: 604800, reset_at: 1800000010 },
  },
}

test("parses only real windows with validated percentages and durations", () => {
  expect(parseCodexUsage(payload)).toEqual({
    provider: "codex", label: "Codex", plan: "plus", status: "available",
    windows: [
      { label: "5h window", remainingPercent: 75, resetsAt: new Date(1800000000000).toISOString() },
      { label: "7d window", remainingPercent: 0, resetsAt: new Date(1800000010000).toISOString() },
    ],
  })
  const result = parseCodexUsage({ rate_limit: { primary_window: { used_percent: 0, limit_window_seconds: "18000", reset_at: 1e100 } } })
  expect(result.windows).toEqual([{ label: "Primary window", remainingPercent: 100, resetsAt: null }])
  expect(result.plan).toBeNull()
})

test("missing, malformed and out-of-range percentages never invent remaining usage", () => {
  for (const used of [undefined, null, "20", -1, 101, NaN, Infinity, {}, []]) {
    const result = parseCodexUsage({ plan_type: "private-upstream-string", rate_limit: { primary_window: { used_percent: used } } })
    expect(result.status).toBe("unavailable")
    expect(result.windows).toEqual([])
    expect(result.plan).toBeNull()
  }
  for (const data of [null, [], "invalid", {}, { rate_limit: null }]) {
    expect(parseCodexUsage(data).status).toBe("unavailable")
  }
})

test("disconnected connections never make remote requests and unsupported coding providers expose no fiction", async () => {
  for (const state of ["disconnected", "pending", "failed", "cancelled", "expired"]) {
    const fetcher = (async () => { throw new Error("Unexpected remote request") }) as unknown as typeof fetch
    const result = await agentUsageSnapshot(fixture(state).context, [], fetcher)
    expect(result.agents).toEqual([])
    const other = await agentUsageSnapshot(fixture(state).context, [{ provider: "cursor" }, { provider: "openai" }, { provider: "claude-code" }], fetcher)
    expect(other.agents.map((agent) => agent.provider)).toEqual(["cursor"])
    expect(other.agents[0].status).toBe("unavailable")
    expect(other.agents[0].windows).toEqual([])
  }
})

test("quota requests have a fixed secure endpoint and serialize no credentials or raw upstream fields", async () => {
  let calls = 0
  const fetcher = (async (url, init) => {
    calls++
    expect(String(url)).toBe("https://chatgpt.com/backend-api/wham/usage")
    expect(init?.method).toBe("GET")
    expect(init?.cache).toBe("no-store")
    expect(init?.redirect).toBe("error")
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-access")
    expect(new Headers(init?.headers).get("ChatGPT-Account-Id")).toBe("account-test")
    return Response.json({ ...payload, private_data: "synthetic-secret" })
  }) as typeof fetch
  const result = await agentUsageSnapshot(fixture().context, [], fetcher)
  expect(calls).toBe(1)
  expect(agentUsageSnapshotSchema.safeParse(result).success).toBe(true)
  expect(result.agents[0].status).toBe("available")
  expect(JSON.stringify(result)).not.toContain("synthetic")
})

test("upstream errors, malformed bodies, oversized bodies and network failures are sanitized", async () => {
  for (const response of [
    new Response("synthetic-private-error", { status: 403 }),
    new Response("synthetic-private-error", { status: 429 }),
    new Response("synthetic-private-error", { status: 500 }),
    new Response("synthetic-private-error"),
    new Response("x".repeat(131073)),
    Response.json({ rate_limit: { primary_window: { used_percent: -10 } } }),
  ]) {
    const fetcher = (async () => response) as unknown as typeof fetch
    const result = await agentUsageSnapshot(fixture().context, [], fetcher)
    expect(result.agents[0].status).toBe("unavailable")
    expect(result.agents[0].windows).toEqual([])
    expect(JSON.stringify(result)).not.toContain("synthetic")
  }
  const fetcher = (async () => { throw new Error("synthetic-network-secret") }) as unknown as typeof fetch
  expect(JSON.stringify(await agentUsageSnapshot(fixture().context, [], fetcher))).not.toContain("synthetic")
})

test("401 refreshes stored credentials once and retries quota at most once", async () => {
  const calls: string[] = []
  const fetcher = (async (url) => {
    calls.push(String(url))
    return String(url).endsWith("/oauth/token") ? Response.json({ access_token: "synthetic-new" }) : new Response(null, { status: 401 })
  }) as typeof fetch
  const result = await agentUsageSnapshot(fixture().context, [], fetcher)
  expect(calls).toEqual([
    "https://chatgpt.com/backend-api/wham/usage", "https://auth.openai.com/oauth/token", "https://chatgpt.com/backend-api/wham/usage",
  ])
  expect(result.agents[0].status).toBe("unavailable")
  expect(result.agents[0].message).toContain("Reconnect")
})

test("membership revocation propagates instead of returning private usage", async () => {
  const { context } = fixture()
  context.store.get = async () => { throw new CodexError("synthetic-private-error", 403) }
  await expect(agentUsageSnapshot(context, [])).rejects.toMatchObject({ statusCode: 403 })
})

test("successful refresh uses rotated stored credentials without serializing them", async () => {
  let calls = 0
  const fetcher = (async (url, init) => {
    calls++
    if (String(url).endsWith("/oauth/token")) return Response.json({ access_token: "synthetic-new" })
    if (calls === 1) return new Response(null, { status: 401 })
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-new")
    return Response.json(payload)
  }) as typeof fetch
  const result = await agentUsageSnapshot(fixture().context, [], fetcher)
  expect(calls).toBe(3)
  expect(result.agents[0].status).toBe("available")
  expect(JSON.stringify(result)).not.toContain("synthetic")
})

test("failed refresh does not retry quota or leak provider errors", async () => {
  let calls = 0
  const fetcher = (async () => {
    calls++
    return new Response("synthetic-private-error", { status: 401 })
  }) as unknown as typeof fetch
  const result = await agentUsageSnapshot(fixture().context, [], fetcher)
  expect(calls).toBe(2)
  expect(result.agents[0].status).toBe("unavailable")
  expect(result.agents[0].message).toContain("Reconnect")
  expect(JSON.stringify(result)).not.toContain("synthetic")
})

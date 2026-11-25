import { expect, test } from "bun:test"
import { admitEveTurn, EveAdmissionError, getEveAdmission, type EveAdmissionArguments, type EveAdmissionInput, type EveAdmissionOptions } from "./admission"

const now = new Date("2026-11-22T10:00:00Z")
const input: EveAdmissionInput = { userId: "user", sessionId: "session", clientMessageId: "client-1", content: "Explain this", provider: "codex", model: "gpt-5", mode: "chat", surface: "web" }
const env = { NOVA_EVE_CANARY_ENABLED: "true", NOVA_EVE_CANARY_USER_IDS: "other, user", NOVA_EVE_CANARY_PROVIDERS: "codex,openai" }
type Row = Record<string, unknown>

function fixture() {
  let state = {
    session: { id: "session", organizationId: "org", initiatorMembershipId: "member", nextSequence: 5, activeRunId: null as string | null },
    runs: [] as Row[], messages: [] as Row[], invocations: [] as Row[], surfaces: [] as Row[],
  }
  let memberActive = true
  let organizationId = "org"
  let connected = true
  let failInvocation = false
  let queue = Promise.resolve()
  const calls: string[] = []
  const prior = [{ role: "assistant", content: "previous answer" }, { role: "user", content: "previous question" }]
  const db = {
    $queryRaw: async () => { calls.push("lock") },
    agentSession: {
      findUnique: async () => { calls.push("session"); return state.session },
      update: async ({ data }: { data: { activeRunId: string } }) => { state.session.activeRunId = data.activeRunId; state.session.nextSequence++; return state.session },
    },
    user: { findUnique: async () => ({ organizationId }) },
    organizationMembership: { findFirst: async ({ where }: { where: Row }) => {
      expect(where).toEqual({ id: state.session.initiatorMembershipId ?? "", userId: "user", organizationId: "org", status: "active" })
      return memberActive && state.session.initiatorMembershipId === "member" ? { id: "member" } : null
    } },
    novaCodexConnection: { findFirst: async ({ where }: { where: Row }) => {
      expect(where).toEqual({ membershipId: "member", state: "connected", membership: { id: "member", userId: "user", organizationId: "org", status: "active" } })
      return connected ? { connectedAt: now } : null
    } },
    novaProviderCredential: { findFirst: async ({ where }: { where: Row }) => {
      expect(where).toEqual({ membershipId: "member", provider: "openai", status: "connected", enabled: true, membership: { id: "member", userId: "user", organizationId: "org", status: "active" } })
      return connected ? { updatedAt: now } : null
    } },
    agentRun: {
      findFirst: async () => state.runs.find((run) => !["completed", "failed", "cancelled"].includes(String(run.status))) ?? null,
      create: async ({ data }: { data: Row }) => { const row = { ...data, id: `run-${state.runs.length + 1}` }; state.runs.push(row); return row },
    },
    agentSessionMessage: {
      findMany: async ({ take, select }: { take: number; select: Row }) => { expect(take).toBe(12); expect(select).toEqual({ role: true, content: true }); return prior.slice(0, take) },
      create: async ({ data }: { data: Row }) => { const row = { ...data, id: `message-${state.messages.length + 1}` }; state.messages.push(row); return row },
    },
    sessionSurface: { upsert: async ({ create, update }: { create: Row; update: Row }) => {
      const found = state.surfaces.find((row) => row.surfaceKey === create.surfaceKey)
      if (found) { Object.assign(found, update); return found }
      const row = { ...create, id: "surface" }; state.surfaces.push(row); return row
    } },
    toolInvocation: {
      findUnique: async ({ where }: { where: Row }) => {
        const row = state.invocations.find((row) => row.idempotencyKey === where.idempotencyKey)
        return row ? { ...row, run: state.runs.find((run) => run.id === row.runId) } : null
      },
      findFirst: async ({ where }: { where: Row }) => {
        const row = state.invocations.find((row) => row.runId === where.runId)
        return row ? { ...row, run: state.runs.find((run) => run.id === row.runId) } : null
      },
      create: async ({ data }: { data: Row }) => {
        if (failInvocation) throw new Error("synthetic database failure")
        state.invocations.push({ ...data, id: "invocation" }); return data
      },
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => {
      const predecessor = queue
      let release = () => {}
      queue = new Promise<void>((resolve) => { release = resolve })
      await predecessor
      const before = structuredClone(state)
      calls.push("transaction")
      try { return await fn(db) } catch (error) { state = before; throw error } finally { release() }
    },
  }
  const options: EveAdmissionOptions = { prisma: db as unknown as EveAdmissionOptions["prisma"], env, now: () => now, readConfig: async () => ({ apiKey: "synthetic-personal-key", apiFamily: "openai" }) }
  return {
    options, calls, prior, state: () => state,
    setMemberActive: (value: boolean) => { memberActive = value },
    setOrganization: (value: string) => { organizationId = value },
    setConnected: (value: boolean) => { connected = value },
    failInvocation: () => { failInvocation = true },
  }
}

test("atomically admits a scoped read-only run, canonical message, and immutable invocation", async () => {
  const f = fixture()
  const result = await admitEveTurn(input, f.options)
  expect(f.calls.slice(0, 3)).toEqual(["transaction", "lock", "session"])
  expect(result).toMatchObject({ id: "run-1", runId: "run-1", latestSequence: 5, replayed: false, userMessage: { sequence: 5, role: "user", senderId: "member", surfaceId: "surface" } })
  const state = f.state()
  expect(state.runs[0]).toMatchObject({ executionTarget: "eve", status: "queued", policySnapshot: { readOnly: true, billing: "personal_account", credits: 0, allowedTools: ["runtime_info"], sandbox: false, mcp: false } })
  expect(state.messages[0]).toMatchObject({ externalId: input.clientMessageId, metadata: { runId: "run-1", clientMessageId: input.clientMessageId, runtime: "eve" } })
  expect(state.invocations[0]).toMatchObject({ capability: "nova-eve:admission", toolName: "eve_admission", riskClass: "read", status: "pending", idempotencyKey: "nova-eve:session:client-1", result: { runtimeSessionId: null, nextLine: 0, replyParts: {} } })
  const args = state.invocations[0].arguments as EveAdmissionArguments
  expect(args.scope).toMatchObject({ userId: "user", organizationId: "org", membershipId: "member", novaSessionId: "session", provider: "codex" })
  expect(args.scope.connectionId).toHaveLength(43)
  expect(args.history).toEqual([{ role: "user", text: "previous question" }, { role: "assistant", text: "previous answer" }])
  expect(args.expiresAt).toBe("2026-11-22T10:15:00.000Z")
  expect(state.surfaces[0]).toMatchObject({ surfaceKey: "nova-eve:session:web", lastInboundAt: now })
  expect(state.session).toMatchObject({ nextSequence: 6, activeRunId: "run-1" })
  expect(await getEveAdmission("user", "session", result.runId, f.options)).toMatchObject({ run: { id: "run-1" }, scope: args.scope })
})

test("concurrent duplicate admission replays and never creates a second message or run", async () => {
  const f = fixture()
  const results = await Promise.all([admitEveTurn(input, f.options), admitEveTurn(input, f.options)])
  expect(results.map((result) => result.replayed)).toEqual([false, true])
  expect(results[0].userMessage).toEqual(results[1].userMessage)
  expect(f.state().runs).toHaveLength(1)
  expect(f.state().messages).toHaveLength(1)
  for (const change of [{ content: "Different" }, { model: "other" }, { mode: "plan" as const }, { surface: "desktop" as const }, { effort: "high" as const }]) {
    await expect(admitEveTurn({ ...input, ...change }, f.options)).rejects.toMatchObject({ statusCode: 409 })
  }
})

test("simultaneous distinct requests cannot overwrite an active run", async () => {
  const f = fixture()
  const results = await Promise.allSettled([admitEveTurn(input, f.options), admitEveTurn({ ...input, clientMessageId: "client-2" }, f.options)])
  expect(results[0].status).toBe("fulfilled")
  expect(results[1]).toMatchObject({ status: "rejected", reason: { statusCode: 409 } })
  expect(f.state().session.activeRunId).toBe("run-1")
  f.state().runs[0].status = "completed"
  await admitEveTurn({ ...input, clientMessageId: "client-2" }, f.options)
  expect(f.state().runs).toHaveLength(2)
  expect(f.state().messages.map((message) => message.sequence)).toEqual([5, 6])
})

test("rolls all writes back on failure", async () => {
  const f = fixture()
  f.failInvocation()
  await expect(admitEveTurn(input, f.options)).rejects.toThrow("synthetic database failure")
  expect(f.state().runs).toHaveLength(0)
  expect(f.state().messages).toHaveLength(0)
  expect(f.state().surfaces).toHaveLength(0)
  expect(f.state().session).toMatchObject({ nextSequence: 5, activeRunId: null })
})

test("default-off gate and exact user/provider allowlists fail closed without writes", async () => {
  for (const override of [{}, { ...env, NOVA_EVE_CANARY_ENABLED: "TRUE" }, { ...env, NOVA_EVE_CANARY_USER_IDS: "user-extra" }, { ...env, NOVA_EVE_CANARY_PROVIDERS: "codex-extra" }]) {
    const f = fixture()
    await expect(admitEveTurn(input, { ...f.options, env: override })).rejects.toMatchObject({ statusCode: 403 })
    expect(f.calls).toEqual([])
  }
  for (const provider of ["anthropic", "supercode", "minimax", "custom", "Codex"]) {
    const f = fixture()
    await expect(admitEveTurn({ ...input, provider }, { ...f.options, env: { ...env, NOVA_EVE_CANARY_PROVIDERS: provider } })).rejects.toBeInstanceOf(EveAdmissionError)
    expect(f.calls).toEqual([])
  }
})

test("rejects attachments, tools, missing client IDs, and agent mode", async () => {
  for (const change of [{ attachments: [] }, { localAttachments: [] }, { tools: ["shell"] }, { mode: "agent" }, { clientMessageId: "" }, { content: " " }, { content: [{ type: "image" }] }]) {
    const f = fixture()
    await expect(admitEveTurn({ ...input, ...change } as EveAdmissionInput, f.options)).rejects.toMatchObject({ statusCode: 400 })
    expect(f.calls).toEqual([])
  }
})

test("requires exact active initiator membership and organization even on replay and read", async () => {
  for (const revoke of [(f: ReturnType<typeof fixture>) => f.setMemberActive(false), (f: ReturnType<typeof fixture>) => f.setOrganization("other"), (f: ReturnType<typeof fixture>) => { f.state().session.initiatorMembershipId = "other" }]) {
    const f = fixture()
    await admitEveTurn(input, f.options)
    revoke(f)
    await expect(admitEveTurn(input, f.options)).rejects.toMatchObject({ statusCode: 403 })
    await expect(getEveAdmission("user", "session", "run-1", f.options)).rejects.toMatchObject({ statusCode: 403 })
    expect(f.state().runs).toHaveLength(1)
  }
})

test("requires connected credentials and verifies personal provider config without persisting keys", async () => {
  const unsupported = fixture()
  await expect(admitEveTurn({ ...input, provider: "openai", effort: "high" }, unsupported.options)).rejects.toMatchObject({ statusCode: 400 })
  expect(unsupported.calls).toEqual([])
  for (const provider of ["codex", "openai"]) {
    const f = fixture()
    f.setConnected(false)
    await expect(admitEveTurn({ ...input, provider }, f.options)).rejects.toMatchObject({ statusCode: 403 })
    expect(f.state().runs).toHaveLength(0)
  }
  for (const config of [{}, { apiKey: " " }, { apiKey: "key", apiFamily: "anthropic" as const }]) {
    const f = fixture()
    await expect(admitEveTurn({ ...input, provider: "openai" }, { ...f.options, readConfig: async () => config })).rejects.toMatchObject({ statusCode: 403 })
    expect(f.state().messages).toHaveLength(0)
  }
  const f = fixture()
  await admitEveTurn({ ...input, provider: "openai" }, f.options)
  expect(JSON.stringify(f.state())).not.toContain("synthetic-personal-key")
})

test("history is capped at twelve text entries and sixteen thousand characters", async () => {
  const f = fixture()
  f.prior.splice(0, f.prior.length, ...Array.from({ length: 20 }, () => ({ role: "assistant", content: "a".repeat(2000) })))
  await admitEveTurn(input, f.options)
  const args = f.state().invocations[0].arguments as EveAdmissionArguments
  expect(args.history.length).toBeLessThanOrEqual(12)
  expect(args.history.reduce((total, message) => total + message.text.length, 0)).toBe(16000)
  expect(await getEveAdmission("user", "session", "unknown", f.options).catch((error: EveAdmissionError) => error.statusCode)).toBe(404)
})

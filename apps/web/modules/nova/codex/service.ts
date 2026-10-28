import { createHash, randomUUID } from "node:crypto"

import { CODEX_VERIFICATION_URL, CodexError, deviceSchema, type CodexProvider } from "./provider"
import type { CodexVault } from "./vault"

export type CodexState = "disconnected" | "starting" | "pending" | "polling" | "connected" | "cancelled" | "expired" | "failed"
export type CodexRow = {
  membershipId: string
  state: string
  version: number
  attemptId: string | null
  sessionHash: string | null
  encryptedAttempt: string | null
  encryptedCredentials: string | null
  intervalSeconds: number
  expiresAt: Date | null
  nextPollAt: Date | null
  lastStartedAt: Date | null
  connectedAt: Date | null
}
export type CodexPatch = Partial<Omit<CodexRow, "membershipId" | "version">>
export type CodexStore = {
  get(): Promise<CodexRow>
  compareAndSwap(version: number, patch: CodexPatch): Promise<boolean>
}
export type CodexOwner = { userId: string; organizationId: string; membershipId: string; sessionId: string }
export type CodexView = {
  state: CodexState
  attemptId?: string
  userCode?: string
  verificationUrl?: string
  expiresAt?: string
  retryAfterSeconds?: number
  connectedAt?: string
}
const ACTIVE = ["starting", "pending", "polling"]
const CLEARED = { encryptedAttempt: null, encryptedCredentials: null, sessionHash: null, attemptId: null, expiresAt: null, nextPollAt: null, connectedAt: null }

export function createCodexService(input: {
  owner: CodexOwner
  store: CodexStore
  provider: CodexProvider
  vault: () => CodexVault
  now?: () => number
}) {
  const { owner, store, provider } = input
  const now = input.now ?? Date.now
  const sessionHash = createHash("sha256").update(owner.sessionId).digest("hex")
  const binding = (purpose: string) => JSON.stringify([owner.organizationId, owner.userId, owner.membershipId, purpose])

  function assertAttempt(row: CodexRow, attemptId: string) {
    if (row.membershipId !== owner.membershipId || row.attemptId !== attemptId || row.sessionHash !== sessionHash) {
      throw new CodexError("Codex login attempt not found in this session", 404)
    }
  }

  async function read(): Promise<CodexRow> {
    for (let tries = 0; tries < 5; tries++) {
      const row = await store.get()
      if (row.membershipId !== owner.membershipId) throw new CodexError("Codex connection not found", 404)
      const expired = ACTIVE.includes(row.state) && (!row.expiresAt || row.expiresAt.getTime() <= now())
      const abandoned = ["starting", "polling"].includes(row.state) && row.nextPollAt && row.nextPollAt.getTime() <= now()
      if (!expired && !abandoned) return row
      if (await store.compareAndSwap(row.version, { ...CLEARED, state: expired ? "expired" : "failed" })) continue
    }
    throw new CodexError("Codex connection changed. Try again.", 409)
  }

  function view(row: CodexRow): CodexView {
    const state = row.state as CodexState
    if (state === "connected") return { state, connectedAt: row.connectedAt?.toISOString() }
    const basic: CodexView = { state }
    if (!ACTIVE.includes(state) || row.sessionHash !== sessionHash) return basic
    basic.attemptId = row.attemptId ?? undefined
    basic.expiresAt = row.expiresAt?.toISOString()
    basic.retryAfterSeconds = Math.max(1, Math.ceil(((row.nextPollAt?.getTime() ?? now()) - now()) / 1000))
    if (row.encryptedAttempt && row.attemptId) {
      const device = deviceSchema.parse(input.vault().open(row.encryptedAttempt, binding(`attempt:${row.attemptId}`)))
      basic.userCode = device.user_code
      basic.verificationUrl = CODEX_VERIFICATION_URL
    }
    return basic
  }

  async function fail(version: number) {
    await store.compareAndSwap(version, { ...CLEARED, state: "failed" })
  }

  return {
    async status(): Promise<CodexView> { return view(await read()) },
    async start(): Promise<CodexView> {
      const vault = input.vault() // Fail closed before issuing a device code.
      const row = await read()
      if (row.state === "connected" || ACTIVE.includes(row.state)) throw new CodexError("Disconnect or cancel the existing Codex connection first", 409)
      if (row.lastStartedAt && now() - row.lastStartedAt.getTime() < 60_000) throw new CodexError("Wait one minute before starting another Codex login", 429)
      const attemptId = randomUUID()
      const expiresAt = new Date(now() + 900_000)
      if (!await store.compareAndSwap(row.version, {
        ...CLEARED, state: "starting", attemptId, sessionHash, expiresAt,
        lastStartedAt: new Date(now()), nextPollAt: new Date(now() + 45_000),
      })) throw new CodexError("Codex connection changed. Try again.", 409)
      const version = row.version + 1
      try {
        const device = await provider.start()
        const patch = {
          state: "pending", intervalSeconds: device.interval,
          encryptedAttempt: vault.seal(deviceSchema.parse(device), binding(`attempt:${attemptId}`)),
          nextPollAt: new Date(now() + device.interval * 1000),
        }
        if (!await store.compareAndSwap(version, patch)) throw new CodexError("Codex login was cancelled or replaced", 409)
        return view(await read())
      } catch (error) {
        await fail(version)
        throw error
      }
    },
    async poll(attemptId: string): Promise<CodexView> {
      const row = await read()
      assertAttempt(row, attemptId)
      if (row.state !== "pending" || !row.nextPollAt || row.nextPollAt.getTime() > now()) return view(row)
      if (!await store.compareAndSwap(row.version, { state: "polling", nextPollAt: new Date(now() + 45_000) })) return view(await read())
      const version = row.version + 1
      try {
        const vault = input.vault()
        const device = deviceSchema.parse(vault.open(row.encryptedAttempt!, binding(`attempt:${attemptId}`)))
        const result = await provider.poll(device)
        if (row.expiresAt!.getTime() <= now()) {
          await store.compareAndSwap(version, { ...CLEARED, state: "expired" })
        } else if (result.pending) {
          await store.compareAndSwap(version, {
            state: "pending",
            nextPollAt: new Date(now() + Math.max(row.intervalSeconds, result.retryAfter ?? 0) * 1000),
          })
        } else {
          await store.compareAndSwap(version, {
            ...CLEARED, state: "connected", connectedAt: new Date(now()),
            encryptedCredentials: vault.seal(result.tokens, binding("credentials")),
          })
        }
        return view(await read())
      } catch (error) {
        await fail(version)
        throw error
      }
    },
    async cancel(attemptId: string): Promise<CodexView> {
      for (let tries = 0; tries < 5; tries++) {
        const row = await read()
        assertAttempt(row, attemptId)
        if (!ACTIVE.includes(row.state)) return view(row)
        if (await store.compareAndSwap(row.version, { ...CLEARED, state: "cancelled" })) return { state: "cancelled" }
      }
      throw new CodexError("Codex connection changed. Try again.", 409)
    },
    async disconnect(): Promise<CodexView> {
      for (let tries = 0; tries < 5; tries++) {
        const row = await read()
        if (await store.compareAndSwap(row.version, { ...CLEARED, state: "disconnected" })) return { state: "disconnected" }
      }
      throw new CodexError("Codex connection changed. Try again.", 409)
    },
  }
}

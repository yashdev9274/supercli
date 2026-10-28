import { randomUUID } from "node:crypto"
import { z } from "zod"

import { assertConnectionOwner, hasPlanPermission, type ChatGPTConnectionRecord } from "./contracts"

type Owner = { userId: string; organizationId: string }
export type LifecycleRecord = ChatGPTConnectionRecord & { cleanupRefs: string[] }
const tokenSchema = z.object({
  accessToken: z.string().min(1).max(32768),
  refreshToken: z.string().min(1).max(32768),
  expiresAt: z.number().finite().positive(),
  scopes: z.array(z.string().min(1)),
}).strict()
export type TokenBundle = z.infer<typeof tokenSchema>

/** Contract only: production adapters require distributed exclusion with fencing.
 * The lock covers all reads, saves and provider calls. save must be atomic,
 * version-checked and definitive (a rejection cannot mean a committed write).
 * Lock loss must prevent saves AND further credential/provider access.
 */
export interface LifecycleStore {
  exclusive<T>(id: string, operation: (storage: {
    read(): Promise<LifecycleRecord | null>
    save(record: LifecycleRecord): Promise<void>
  }) => Promise<T>): Promise<T>
}

/** Immutable references; remove is idempotent. No adapter is wired to production. */
export interface TokenVault {
  read(reference: string): Promise<unknown>
  write(reference: string, bundle: TokenBundle): Promise<void>
  remove(reference: string): Promise<void>
}
export interface TokenProvider {
  /** Must validate refresh response identity against this registration. */
  refresh(bundle: TokenBundle, identity: { issuer: string; subject: string; clientId: string }): Promise<unknown>
  /** Resolve approved revocation endpoint from discovery; never accept arbitrary URLs. */
  revoke(bundle: TokenBundle): Promise<void>
}

function tokens(value: unknown, now: number): TokenBundle {
  const parsed = tokenSchema.safeParse(value)
  if (!parsed.success || parsed.data.expiresAt <= now || !hasPlanPermission(parsed.data.scopes)) {
    throw new Error("ChatGPT credentials require reconnection")
  }
  return parsed.data
}

function storedTokens(value: unknown): TokenBundle {
  const parsed = tokenSchema.safeParse(value)
  if (!parsed.success) throw new Error("ChatGPT credentials require reconnection")
  return parsed.data
}

/** Offline lifecycle implementation. Never expose token-returning methods to a client or route.
 * Authentication, CSRF/rate limits and production persistence remain separate prerequisites.
 */
export class ChatGPTLifecycle {
  constructor(
    private readonly store: LifecycleStore,
    private readonly vault: TokenVault,
    private readonly provider: TokenProvider,
    private readonly now: () => number = Date.now,
  ) {}

  private async owned(record: LifecycleRecord | null, owner: Owner): Promise<LifecycleRecord> {
    if (!record) throw new Error("ChatGPT connection not found")
    assertConnectionOwner(record, owner)
    return record
  }

  /** Activates an already identity-verified, owner-bound connecting record. */
  async activate(id: string, owner: Owner, value: unknown): Promise<void> {
    try {
      await this.store.exclusive(id, async (storage) => {
        const record = await this.owned(await storage.read(), owner)
        if (record.status !== "connecting" || record.credentialRef) throw new Error("Invalid connection state")
        const bundle = tokens(value, this.now())
        const reference = randomUUID()
        const blocked: LifecycleRecord = { ...record, status: "reconnect_required", credentialRef: reference, version: record.version + 1 }
        // Persist the cleanup handle BEFORE writing a secret, including partial writes.
        await storage.save(blocked)
        await this.vault.write(reference, bundle)
        await storage.save({ ...blocked, status: "connected", scopes: bundle.scopes, expiresAt: bundle.expiresAt, version: blocked.version + 1 })
      })
    } catch {
      throw new Error("ChatGPT connection could not be activated")
    }
  }

  /** Server-internal only. Existing in-flight tokens are not recalled by disconnect. */
  async accessToken(id: string, owner: Owner): Promise<string> {
    try {
      return await this.store.exclusive(id, async (storage) => {
        const record = await this.owned(await storage.read(), owner)
        if (record.status !== "connected" || !record.credentialRef || !hasPlanPermission(record.scopes)) {
          throw new Error("Reconnect required")
        }
        const bundle = storedTokens(await this.vault.read(record.credentialRef))
        if (!hasPlanPermission(bundle.scopes)) throw new Error("Reconnect required")
        if (Math.min(bundle.expiresAt, record.expiresAt) > this.now() + 60_000) return bundle.accessToken
        // If rotation or persistence is uncertain, later requests cannot reuse the old refresh token.
        const reference = randomUUID()
        const blocked: LifecycleRecord = {
          ...record, status: "reconnect_required", version: record.version + 1,
          cleanupRefs: [...new Set([...record.cleanupRefs, reference])],
        }
        await storage.save(blocked)
        const next = tokens(await this.provider.refresh(bundle, {
          issuer: record.issuer, subject: record.subject, clientId: record.clientId,
        }), this.now())
        if (next.expiresAt <= this.now() + 60_000) throw new Error("Invalid token lifetime")
        await this.vault.write(reference, next)
        const connected: LifecycleRecord = {
          ...blocked, status: "connected", credentialRef: reference,
          scopes: next.scopes, expiresAt: next.expiresAt, version: blocked.version + 1,
          cleanupRefs: [...new Set([...record.cleanupRefs, record.credentialRef])],
        }
        await storage.save(connected)
        // Retain cleanup references durably; disconnect retries idempotent deletion.
        for (const stale of connected.cleanupRefs) await this.vault.remove(stale).catch(() => undefined)
        return next.accessToken
      })
    } catch {
      throw new Error("ChatGPT credentials are unavailable; reconnect your account")
    }
  }

  async disconnect(id: string, owner: Owner): Promise<{ revocation: "confirmed" | "unconfirmed"; cleanup: "complete" | "pending" }> {
    try {
      return await this.store.exclusive(id, async (storage) => {
        const record = await this.owned(await storage.read(), owner)
        const references = [...new Set([...record.cleanupRefs, ...(record.credentialRef ? [record.credentialRef] : [])])]
        const blocked: LifecycleRecord = {
          ...record, status: "disconnected", credentialRef: null, scopes: [], expiresAt: 0,
          cleanupRefs: references, version: record.version + 1,
        }
        await storage.save(blocked)
        let revocation: "confirmed" | "unconfirmed" = "unconfirmed"
        if (record.credentialRef) {
          try {
            await this.provider.revoke(storedTokens(await this.vault.read(record.credentialRef)))
            revocation = "confirmed"
          } catch { /* Local disconnect still proceeds; do not claim remote revocation. */ }
        }
        const pending: string[] = []
        for (const reference of references) {
          try { await this.vault.remove(reference) } catch { pending.push(reference) }
        }
        try {
          await storage.save({ ...blocked, cleanupRefs: pending, version: blocked.version + 1 })
        } catch {
          return { revocation, cleanup: "pending" }
        }
        return { revocation, cleanup: pending.length ? "pending" : "complete" }
      })
    } catch {
      throw new Error("ChatGPT disconnect could not be completed")
    }
  }
}

import { createHash } from "node:crypto"
import type { HarnessStreamEvent } from "./client"

export class InteractionPending extends Error {
  constructor(readonly invocationId: string) {
    super("Waiting for user input")
    this.name = "InteractionPending"
  }
}

export type Receipt = { id: string; hash: string; status: string; result: unknown }
export type JournalStore = {
  reserve(key: string, hash: string, name: string, args: unknown): Promise<Receipt>
  claim(id: string): Promise<boolean>
  finish(id: string, result: unknown): Promise<void>
  wait(id: string, kind: "question" | "approval", payload: unknown): Promise<void>
}

export type DurableJournal = {
  fork(key: string): DurableJournal
  readonly delegation: { key: string; offset: number } | undefined
  inference(args: unknown, execute: () => Promise<{ events: HarnessStreamEvent[]; state?: unknown }>): Promise<{ events: HarnessStreamEvent[]; state?: unknown }>
  tool(name: string, args: Record<string, unknown>, approval: boolean, unattended: boolean, execute: () => Promise<unknown>): Promise<unknown>
}

export function stableHash(value: unknown): string {
  const normalize = (item: unknown): unknown => Array.isArray(item) ? item.map(normalize)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)])) : item
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex")
}

/** Replays recorded inference, not another model loop. Uncertain executions never retry. */
export function createDurableJournal(store: JournalStore, scope = "primary"): DurableJournal {
  let cursor = 0
  let childCursor = 0
  let delegation: { key: string; offset: number } | undefined
  const forks = new Map<string, DurableJournal>()
  async function entry(name: string, args: unknown) {
    const hash = stableHash({ name, args })
    const key = `${scope}:${cursor++}`
    const receipt = await store.reserve(key, hash, name, args)
    if (receipt.hash !== hash) throw new Error("Resume diverged from the recorded harness execution")
    return receipt
  }
  return {
    fork(key: string): DurableJournal {
      if (!key || key.length > 200) throw new Error("Invalid child journal key")
      const scoped = `${scope}/child/${encodeURIComponent(key)}`
      let journal = forks.get(scoped)
      if (!journal) {
        journal = createDurableJournal(store, scoped)
        forks.set(scoped, journal)
      }
      return journal
    },
    get delegation() { return delegation },
    async inference(args: unknown, execute: () => Promise<{ events: HarnessStreamEvent[]; state?: unknown }>) {
      const receipt = await entry("inference", args)
      if (receipt.status === "completed") return receipt.result as { events: HarnessStreamEvent[]; state?: unknown }
      if (!await store.claim(receipt.id)) throw new Error("Inference outcome is uncertain; start a new turn")
      const result = await execute()
      if (JSON.stringify(result).length > 4_000_000) throw new Error("Inference checkpoint exceeds limits")
      await store.finish(receipt.id, result)
      return result
    },
    async tool(name: string, args: Record<string, unknown>, approval: boolean, unattended: boolean, execute: () => Promise<unknown>) {
      const receipt = await entry(name, args)
      const count = name === "delegate" ? 1 : name === "task" && Array.isArray(args.items) ? args.items.length : 0
      const offset = childCursor
      childCursor += count
      if (receipt.status === "completed") return receipt.result
      if (name === "question" || approval) {
        if (unattended) {
          const denied = { success: false, denied: true, error: "Human interaction is unavailable in unattended runs" }
          if (await store.claim(receipt.id)) await store.finish(receipt.id, denied)
          return denied
        }
        if (receipt.status === "pending") await store.wait(receipt.id, name === "question" ? "question" : "approval", { toolName: name, args })
        if (receipt.status !== "approved") throw new InteractionPending(receipt.id)
      }
      if (!await store.claim(receipt.id)) throw new Error("Tool outcome is uncertain; it will not be executed again")
      try {
        if (count) delegation = { key: receipt.id, offset }
        const result = await execute()
        if (JSON.stringify(result ?? null).length > 1_000_000) throw new Error("Tool receipt exceeds limits")
        await store.finish(receipt.id, result ?? null)
        return result
      } catch (error) {
        // Keep executing receipts unresolved: an external mutation may have succeeded.
        throw error
      } finally {
        delegation = undefined
      }
    },
  }
}

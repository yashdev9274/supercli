import { expect, test } from "bun:test"

import { BrowserCreationRejectedError, BrowserError, type BrowserRepository, type BrowserRow, type BrowserStore } from "./contracts"
import { createBrowserService } from "./lifecycle"

function fixture(error: Error) {
  const rows: BrowserRow[] = []
  let attempts = 0
  const repo: BrowserRepository = {
    latest: async () => rows.at(-1) ?? null,
    get: async (id) => rows.find((row) => row.id === id) ?? null,
    countReserved: async () => rows.filter((row) => row.status !== "ended").length,
    create: async (row) => { rows.push(row); return row },
    update: async (id, patch) => {
      const row = rows.find((row) => row.id === id)!
      Object.assign(row, patch)
      return row
    },
  }
  const store: BrowserStore = { locked: async (_scope, work) => work(repo, "org") }
  const service = createBrowserService({
    store, configured: true, now: () => 1_000,
    provider: {
      create: async () => { attempts++; throw error },
      release: async () => false,
      liveView: async () => "",
      connection: async () => "",
    },
  })
  return { service, rows, attempts: () => attempts }
}

test("definitive creation rejection releases the reservation and allows retry", async () => {
  const { service, rows, attempts } = fixture(new BrowserCreationRejectedError("Plan required", 503))
  const scope = { userId: "user", sessionId: "session" }
  await expect(service.start(scope)).rejects.toThrow("Plan required")
  expect(rows[0].status).toBe("ended")
  await expect(service.start(scope)).rejects.toThrow("Plan required")
  expect(attempts()).toBe(2)
})

test("ambiguous creation failure retains the reservation and never duplicates a session", async () => {
  const { service, rows, attempts } = fixture(new BrowserError("Provider unavailable", 502))
  const scope = { userId: "user", sessionId: "session" }
  await expect(service.start(scope)).rejects.toThrow("Provider unavailable")
  expect(rows[0].status).toBe("provisioning")
  await service.start(scope)
  expect(attempts()).toBe(1)
})

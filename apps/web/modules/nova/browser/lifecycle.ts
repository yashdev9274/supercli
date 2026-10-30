import { randomUUID } from "node:crypto"

import {
  ACTION_LEASE_MS, BROWSER_TIMEOUT_MS, BrowserError, MAX_SCREENSHOT_BYTES, SCREENSHOT_TTL_MS,
  type BrowserControl, type BrowserProvider, type BrowserRow, type BrowserScope, type BrowserState, type BrowserStore,
} from "./contracts"

export function createBrowserService(deps: {
  store: BrowserStore
  provider: BrowserProvider
  configured: boolean
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}) {
  const { store, provider } = deps
  const now = deps.now ?? Date.now
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  async function reconcile(scope: BrowserScope): Promise<BrowserRow | null> {
    const row = await store.locked(scope, async (repo) => {
      let row = await repo.latest()
      if (!row) return null
      if (row.screenshotExpiresAt && row.screenshotExpiresAt.getTime() <= now()) {
        row = await repo.update(row.id, { screenshot: null, screenshotVersion: null, screenshotExpiresAt: null })
      }
      if (row.status !== "ended" && (row.expiresAt.getTime() <= now() || (row.leaseToken && (!row.leaseUntil || row.leaseUntil.getTime() <= now())))) {
        row = await repo.update(row.id, { status: "releasing", control: "user", controlVersion: row.controlVersion + 1 })
      }
      return row
    })
    if (!row || row.status !== "releasing") return row
    let ended = row.quotaUntil.getTime() <= now()
    if (row.providerSessionId && deps.configured && !ended) {
      try { ended = await provider.release(row.providerSessionId) } catch { /* Retain reservation and retry on next access. */ }
    }
    if (!ended) return row
    return store.locked(scope, async (repo) => {
      const current = await repo.get(row.id)
      if (!current) return null
      return repo.update(row.id, { status: "ended", screenshot: null, screenshotVersion: null, screenshotExpiresAt: null })
    })
  }
  async function state(scope: BrowserScope): Promise<BrowserState> {
    await reconcile(scope)
    return store.locked(scope, async (repo) => {
      const row = await repo.latest()
      if (!row) return { configured: deps.configured, browser: null }
      const browser: NonNullable<BrowserState["browser"]> = {
        id: row.id, status: row.status, control: row.control, expiresAt: row.expiresAt.toISOString(), busy: Boolean(row.leaseToken),
      }
      // Holding the DB lock prevents a concurrent Resume from racing URL issuance.
      if (deps.configured && row.status === "active" && row.control === "user" && !row.leaseToken && row.providerSessionId) {
        try {
          browser.liveViewUrl = await provider.liveView(row.providerSessionId)
        } catch (error) {
          browser.connectionError = error instanceof BrowserError ? error.message : "Browser live view unavailable; reconnect or start a new session"
        }
      }
      return { configured: deps.configured, browser }
    })
  }
  async function start(scope: BrowserScope): Promise<BrowserState> {
    if (!deps.configured) throw new BrowserError("Browserbase is not configured", 503)
    await reconcile(scope)
    const claim = await store.locked(scope, async (repo, organizationId) => {
      const previous = await repo.latest()
      if (previous && previous.status !== "ended") return null
      if (await repo.countReserved(new Date(now())) >= 2) throw new BrowserError("Organization browser limit reached", 429)
      const row: BrowserRow = {
        id: randomUUID(), organizationId, userId: scope.userId, agentSessionId: scope.sessionId,
        providerSessionId: null, status: "provisioning", control: "user", controlVersion: 0,
        expiresAt: new Date(now() + BROWSER_TIMEOUT_MS),
        // Include REST creation timeout + scheduling margin in conservative quota accounting.
        quotaUntil: new Date(now() + BROWSER_TIMEOUT_MS + 60_000),
        leaseToken: null, leaseUntil: null, screenshot: null, screenshotVersion: null, screenshotExpiresAt: null,
      }
      return repo.create(row)
    })
    if (!claim) return state(scope)
    // Never retry creation: a transport failure may have created a paid browser.
    const created = await provider.create(claim.id)
    try {
      await store.locked(scope, async (repo) => {
        const current = await repo.get(claim.id)
        if (!current) throw new BrowserError("Browser claim unavailable", 409)
        await repo.update(claim.id, { providerSessionId: created.id, status: current.status === "provisioning" ? "active" : "releasing" })
      })
    } catch {
      await provider.release(created.id).catch(() => false)
      throw new BrowserError("Browser could not be attached; wait for expiry", 503)
    }
    return state(scope)
  }
  async function stop(scope: BrowserScope): Promise<BrowserState> {
    await store.locked(scope, async (repo) => {
      const row = await repo.latest()
      if (row && row.status !== "ended") await repo.update(row.id, {
        status: "releasing", control: "user", controlVersion: row.controlVersion + 1,
        screenshot: null, screenshotVersion: null, screenshotExpiresAt: null,
      })
    })
    return state(scope)
  }
  async function control(scope: BrowserScope, control: BrowserControl): Promise<BrowserState> {
    await reconcile(scope)
    const id = await store.locked(scope, async (repo) => {
      const row = await repo.latest()
      if (!row || row.status !== "active") throw new BrowserError("Start an active browser first")
      if (control === "agent" && row.leaseToken) throw new BrowserError("Browser action is still finishing")
      await repo.update(row.id, { control, controlVersion: row.controlVersion + 1 })
      return row.id
    })
    if (control === "user") {
      for (let attempt = 0; attempt < 80; attempt++) {
        const row = await store.locked(scope, (repo) => repo.get(id))
        if (!row?.leaseToken) break
        // Expiry does NOT make the token reclaimable. No interactive URL until
        // the action disconnected and acknowledged completion (or browser ended).
        if (row.status !== "active") break
        await sleep(250)
      }
    }
    return state(scope)
  }
  async function available(scope: BrowserScope): Promise<{ id: string; version: number } | null> {
    if (!deps.configured) return null
    await reconcile(scope)
    return store.locked(scope, async (repo) => {
      const row = await repo.latest()
      return row?.status === "active" && row.control === "agent" && !row.leaseToken
        ? { id: row.id, version: row.controlVersion } : null
    })
  }
  async function action<T>(scope: BrowserScope, expected: { id: string; version: number }, work: (row: BrowserRow, check: () => Promise<void>) => Promise<T>): Promise<T> {
    const token = randomUUID()
    const row = await store.locked(scope, async (repo) => {
      const row = await repo.get(expected.id)
      if (!row || row.status !== "active" || row.control !== "agent" || row.controlVersion !== expected.version || row.expiresAt.getTime() <= now() || row.leaseToken) throw new BrowserError("Browser control changed or is busy; ask the user to resume")
      return repo.update(row.id, { leaseToken: token, leaseUntil: new Date(now() + ACTION_LEASE_MS) })
    })
    const check = async () => store.locked(scope, async (repo) => {
      const current = await repo.get(row.id)
      if (!current || current.status !== "active" || current.control !== "agent" || current.controlVersion !== expected.version || current.leaseToken !== token || !current.leaseUntil || current.leaseUntil.getTime() <= now() || current.expiresAt.getTime() <= now()) throw new BrowserError("Browser control changed; action cancelled")
    })
    let completed = false
    try {
      const result = await work(row, check)
      completed = true
      return result
    } finally {
      // Only acknowledged disconnect success releases a token. Errors (including
      // disconnect failure) quarantine the session until provider termination.
      await store.locked(scope, async (repo) => {
        const current = await repo.get(row.id)
        if (current?.leaseToken === token) await repo.update(row.id, completed
          ? { leaseToken: null, leaseUntil: null }
          : { status: "releasing", control: "user", controlVersion: current.controlVersion + 1 })
      })
    }
  }
  async function saveScreenshot(scope: BrowserScope, id: string, data: Uint8Array): Promise<string> {
    if (data.byteLength > MAX_SCREENSHOT_BYTES) throw new BrowserError("Screenshot exceeds the image limit", 413)
    const version = randomUUID()
    await store.locked(scope, async (repo) => {
      const row = await repo.get(id)
      if (!row || row.status !== "active") throw new BrowserError("Browser unavailable")
      await repo.update(id, { screenshot: data, screenshotVersion: version, screenshotExpiresAt: new Date(now() + SCREENSHOT_TTL_MS) })
    })
    return `/api/nova/sessions/${encodeURIComponent(scope.sessionId)}/browser/screenshot?version=${version}`
  }
  async function screenshot(scope: BrowserScope, version: string): Promise<Uint8Array> {
    return store.locked(scope, async (repo) => {
      const row = await repo.latest()
      if (!row || row.status !== "active" || row.expiresAt.getTime() <= now() || !row.screenshot || row.screenshotVersion !== version || !row.screenshotExpiresAt || row.screenshotExpiresAt.getTime() <= now()) throw new BrowserError("Screenshot not found", 404)
      return row.screenshot
    })
  }
  return { state, start, stop, control, available, action, saveScreenshot, screenshot }
}
export type BrowserService = ReturnType<typeof createBrowserService>

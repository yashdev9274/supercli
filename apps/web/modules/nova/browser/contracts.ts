export type BrowserControl = "user" | "agent"
export type BrowserStatus = "provisioning" | "active" | "releasing" | "ended"

export type BrowserState = {
  configured: boolean
  browser: null | {
    id: string
    status: BrowserStatus
    control: BrowserControl
    expiresAt: string
    liveViewUrl?: string
    connectionError?: string
    busy: boolean
  }
}

export class BrowserError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message)
    this.name = "BrowserError"
  }
}

export const BROWSER_TIMEOUT_MS = 15 * 60_000
export const ACTION_TIMEOUT_MS = 15_000
export const ACTION_LEASE_MS = 25_000
export const LIVE_VIEW_TTL_SECONDS = 60
export const MAX_SCREENSHOT_BYTES = 300_000
export const SCREENSHOT_TTL_MS = 60_000

export type BrowserScope = { userId: string; sessionId: string }
export type BrowserRow = {
  id: string
  organizationId: string
  userId: string
  agentSessionId: string
  providerSessionId: string | null
  status: BrowserStatus
  control: BrowserControl
  controlVersion: number
  expiresAt: Date
  quotaUntil: Date
  leaseToken: string | null
  leaseUntil: Date | null
  screenshot: Uint8Array | null
  screenshotVersion: string | null
  screenshotExpiresAt: Date | null
}

export type BrowserPatch = Partial<Pick<BrowserRow,
  "providerSessionId" | "status" | "control" | "controlVersion" | "expiresAt" |
  "leaseToken" | "leaseUntil" | "screenshot" | "screenshotVersion" | "screenshotExpiresAt"
>>

export interface BrowserRepository {
  latest(): Promise<BrowserRow | null>
  get(id: string): Promise<BrowserRow | null>
  countReserved(now: Date): Promise<number>
  create(row: BrowserRow): Promise<BrowserRow>
  update(id: string, patch: BrowserPatch): Promise<BrowserRow>
}

// The adapter authorizes active membership and current organization inside each
// transaction, and serializes all claims on the organization's database row.
export interface BrowserStore {
  locked<T>(scope: BrowserScope, work: (repo: BrowserRepository, organizationId: string) => Promise<T>): Promise<T>
}

export interface BrowserProvider {
  create(claimId: string): Promise<{ id: string }>
  release(id: string): Promise<boolean>
  liveView(id: string): Promise<string>
  connection(id: string): Promise<string>
}

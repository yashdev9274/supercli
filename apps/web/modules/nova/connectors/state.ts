import { createHmac, timingSafeEqual } from "node:crypto"

import type { NativeConnectorProvider } from "./config"

const STATE_TTL_MS = 10 * 60 * 1000

type ConnectorState = {
  userId: string
  organizationId: string
  provider: NativeConnectorProvider
  returnTo: "desktop" | "web"
  issuedAt: number
}

function secret(): string {
  const value = process.env.NOVA_CONNECTOR_STATE_SECRET || process.env.BETTER_AUTH_SECRET
  if (!value) throw new Error("NOVA_CONNECTOR_STATE_SECRET is not configured")
  return value
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url")
}

export function createConnectorState(input: Omit<ConnectorState, "issuedAt">): string {
  const payload = Buffer.from(JSON.stringify({ ...input, issuedAt: Date.now() })).toString("base64url")
  return `${payload}.${signature(payload)}`
}

export function verifyConnectorState(value: string): ConnectorState | null {
  const [payload, provided] = value.split(".")
  if (!payload || !provided) return null
  const expected = signature(payload)
  const left = Buffer.from(provided)
  const right = Buffer.from(expected)
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ConnectorState
    if (!parsed.userId || !parsed.organizationId || !parsed.provider || !parsed.issuedAt) return null
    if (Date.now() - parsed.issuedAt > STATE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

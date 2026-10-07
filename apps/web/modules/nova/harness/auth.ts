import terminalPrisma from "@super/db-terminal"
import { cookies } from "next/headers"

export const HARNESS_TOKEN_COOKIE = "nova_harness_token"

const HARNESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 14

export function harnessTokenCookieHeader(token: string): string {
  const parts = [
    `${HARNESS_TOKEN_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    `Max-Age=${HARNESS_TOKEN_MAX_AGE_SECONDS}`,
    "HttpOnly",
    "SameSite=Lax",
  ]
  if (process.env.NODE_ENV === "production") parts.push("Secure")
  return parts.join("; ")
}

export function clearHarnessTokenCookieHeader(): string {
  const parts = [
    `${HARNESS_TOKEN_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "SameSite=Lax",
  ]
  if (process.env.NODE_ENV === "production") parts.push("Secure")
  return parts.join("; ")
}

/** Read harness bearer from the Nova cookie, if present and still valid in terminal DB. */
export async function readHarnessTokenFromCookie(email: string): Promise<string | null> {
  try {
    const jar = await cookies()
    const raw = jar.get(HARNESS_TOKEN_COOKIE)?.value
    if (!raw) return null
    // Cookie may be URI-encoded from Set-Cookie; accept either form.
    let token = raw
    try {
      const decoded = decodeURIComponent(raw)
      if (decoded) token = decoded
    } catch {
      // keep raw
    }
    if (!token) return null

    const session = await terminalPrisma.session.findUnique({
      where: { token },
      select: { token: true, expiresAt: true, user: { select: { email: true } } },
    })
    if (!session || session.expiresAt < new Date()) return null
    if (session.user.email.trim().toLowerCase() !== email.trim().toLowerCase()) return null
    return session.token
  } catch (error) {
    console.error("[nova/harness/auth] cookie read failed", error)
    return null
  }
}

export type HarnessAuthResult = {
  token: string
  /** Present when a new token was minted and must be set on the HTTP response. */
  setCookie?: string
}

/**
 * Ensure the web user has a valid terminal (harness) session token in the
 * supercode-cli terminal database — the same Session table /api/ai/chat reads.
 * Prefer the cookie from CLI OTT login; otherwise mint one against the shared
 * terminal user row (matched by email).
 */
export async function ensureHarnessToken(input: {
  email: string
  name?: string | null
  image?: string | null
}): Promise<HarnessAuthResult> {
  if (!process.env.DATABASE_URL_TERMINAL?.trim()) {
    throw new Error(
      "DATABASE_URL_TERMINAL is not set. Nova web cannot authorize the CLI harness.",
    )
  }

  const existing = await readHarnessTokenFromCookie(input.email)
  if (existing) return { token: existing }

  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error("Harness auth requires a user email")

  let user = await terminalPrisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  })
  if (!user) {
    user = await terminalPrisma.user.create({
      data: {
        id: crypto.randomUUID(),
        email,
        name: input.name?.trim() || email.split("@")[0] || "Nova user",
        emailVerified: true,
        image: input.image ?? null,
      },
      select: { id: true },
    })
  }

  const token = crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "")
  const expiresAt = new Date(Date.now() + HARNESS_TOKEN_MAX_AGE_SECONDS * 1000)
  await terminalPrisma.session.create({
    data: {
      id: crypto.randomUUID(),
      token,
      userId: user.id,
      expiresAt,
      ipAddress: null,
      userAgent: "nova-web",
    },
  })

  return {
    token,
    setCookie: harnessTokenCookieHeader(token),
  }
}

import { createHash } from "node:crypto"
import { auth } from "@super/auth/server"
import prisma from "@super/db"

import { terminalHarnessUrl } from "@/modules/nova/harness/client"

export type VoiceCaller = {
  id: string
  email: string
  name: string | null
  image: string | null
  harnessToken: string | null
  sessionId: string
}

export async function resolveVoiceCaller(request: Request): Promise<VoiceCaller | null> {
  const header = request.headers.get("authorization") ?? ""
  if (!header.startsWith("Bearer ")) return null
  const token = header.slice(7).trim()
  if (!token) return null
  const web = await auth.api.getSession({ headers: request.headers })
  if (web?.user?.id && web.user.email && web.session.id) {
    return { id: web.user.id, email: web.user.email, name: web.user.name, image: web.user.image ?? null, harnessToken: null, sessionId: web.session.id }
  }

  const response = await fetch(`${terminalHarnessUrl()}/api/voice/identity`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(8_000)]),
  }).catch(() => null)
  if (!response?.ok) return null
  const terminal = await response.json().catch(() => null) as { email?: string; name?: string; image?: string | null } | null
  const email = terminal?.email?.trim().toLowerCase()
  if (!email) return null
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, name: true, image: true },
  })
  const user = existing ?? await prisma.user.create({
    data: { id: crypto.randomUUID(), email, name: terminal?.name?.trim() || email.split("@")[0] || "Nova user", emailVerified: true, image: terminal?.image ?? null },
    select: { id: true, email: true, name: true, image: true },
  })
  return { ...user, harnessToken: token, sessionId: `voice:${createHash("sha256").update(token).digest("hex")}` }
}

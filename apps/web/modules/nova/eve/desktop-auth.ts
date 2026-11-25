import prisma from "@super/db"
import { terminalHarnessUrl } from "../harness/client"

export async function getEveDesktopUser(authorization: string | null) {
  if (!authorization?.startsWith("Bearer ")) return null
  const response = await fetch(`${terminalHarnessUrl()}/api/user/me`, { headers: { authorization, Accept: "application/json" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(8000) })
  if (!response.ok) { await response.body?.cancel(); return null }
  const user = await response.json() as { email?: unknown; emailVerified?: unknown }
  if (typeof user.email !== "string" || user.emailVerified !== true) return null
  return prisma.user.findFirst({ where: { email: { equals: user.email.trim().toLowerCase(), mode: "insensitive" }, emailVerified: true }, select: { id: true, email: true } })
}

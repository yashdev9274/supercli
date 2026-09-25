import prisma from "@super/db"

export type DesktopReviewUser = {
  id: string
  email: string
}

type TerminalUser = {
  email?: string | null
}

function terminalApiUrl() {
  const defaultUrl =
    process.env.NODE_ENV === "production"
      ? "https://supercode-terminal.vercel.app"
      : "http://localhost:3004"

  return (
    process.env.SUPERCODE_TERMINAL_API_URL ||
    process.env.TERMINAL_SERVER_URL ||
    process.env.NEXT_PUBLIC_TERMINAL_URL ||
    defaultUrl
  ).replace(/\/$/, "")
}

export async function getDesktopReviewUser(
  authorization: string | null,
): Promise<DesktopReviewUser | null> {
  if (!authorization?.startsWith("Bearer ")) return null

  const token = authorization.slice(7).trim()
  if (!token) return null

  const response = await fetch(`${terminalApiUrl()}/api/user/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) return null

  const terminalUser = (await response.json()) as TerminalUser
  const email = terminalUser.email?.trim().toLowerCase()
  if (!email) return null

  return prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true },
  })
}

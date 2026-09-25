/**
 * Chat authentication helpers.
 */
import chalk from "chalk"
import { getStoredToken } from "src/lib/token.ts"
import { getCurrentUser } from "src/lib/api-client.ts"
import { createThinking, theme } from "src/cli/utils/tui.ts"

export type ChatUser = { id: string; name: string | null; email: string }

let currentUser: ChatUser | null = null

export function getCurrentChatUser(): ChatUser | null {
  return currentUser
}

export function setCurrentChatUser(user: ChatUser | null): void {
  currentUser = user
}

export async function getUserFromToken(): Promise<ChatUser> {
  const token = await getStoredToken()
  if (!token?.access_token) {
    console.log(chalk.hex(theme.red)("Not authenticated. Please login first."))
    process.exit(1)
  }

  const thinking = createThinking("authenticating")
  const result = await getCurrentUser()
  if (!result.ok) {
    thinking.fail("Session expired or server unreachable")
    throw new Error("Authentication failed. Run supercode login to re-authenticate.")
  }

  thinking.succeed(`Welcome, ${result.user.name}`)
  currentUser = result.user
  return result.user
}

/** Feature-gate helper for internal builds. */
export function isYashDewasthale(): boolean {
  if (!currentUser) return false
  const name = currentUser.name?.toLowerCase() ?? ""
  const email = currentUser.email?.toLowerCase() ?? ""
  return (
    (name.includes("yash") && name.includes("dewasthale")) ||
    email === "yashdev.yvd@gmail.com" ||
    email === "yash@supercode.ai"
  )
}

export async function getUserPlanTier(): Promise<string> {
  if (!currentUser) return ""
  try {
    const prisma = (await import("src/lib/prisma")).default
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: currentUser.id,
        status: { in: ["active", "trialing"] },
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" },
    })
    if (!subscription?.plan) return ""
    return subscription.plan.tier
  } catch {
    return ""
  }
}

"use server"

import { auth } from "@/lib/auth"
import prisma from "@super/db"
import {
  getGithubToken,
  isGithubReauthRequiredError,
} from "@/modules/github/lib/github"
import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { Octokit } from "octokit"

export type DashboardUserProfile = {
  id: string
  name: string
  email: string
  image: string | null
  githubLogin: string | null
  githubAvatarUrl: string | null
}

export type DashboardOrganization = {
  id: string
  name: string
  slug: string
  /** personal | supercode | github */
  kind: "personal" | "supercode" | "github"
  avatarUrl: string | null
  isCurrent: boolean
}

function slugify(input: string): string {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return cleaned || "org"
}

async function uniqueOrgSlug(base: string): Promise<string> {
  let candidate = base
  let i = 0
  while (true) {
    const existing = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    })
    if (!existing) return candidate
    i += 1
    candidate = `${base}-${i}`
  }
}

async function requireSessionUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  })
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  return session.user
}

/**
 * Logged-in user profile for dashboard chrome (sidebar + avatar menu).
 * Prefers live GitHub profile (login + avatar) when the token is available.
 */
export async function getDashboardUserProfile(): Promise<DashboardUserProfile | null> {
  try {
    const sessionUser = await requireSessionUser()
    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
      },
    })
    if (!dbUser) return null

    let githubLogin: string | null = null
    let githubAvatarUrl: string | null = dbUser.image

    try {
      const token = await getGithubToken()
      const octokit = new Octokit({ auth: token })
      const { data } = await octokit.rest.users.getAuthenticated()
      githubLogin = data.login
      githubAvatarUrl = data.avatar_url || dbUser.image
    } catch (error) {
      if (!isGithubReauthRequiredError(error)) {
        console.warn("[dashboard] GitHub profile fetch failed:", error)
      }
      // Fall back to Better Auth accountId when token is unavailable
      try {
        const account = await prisma.account.findFirst({
          where: { userId: dbUser.id, providerId: "github" },
          select: { accountId: true },
          orderBy: { updatedAt: "desc" },
        })
        if (account?.accountId) githubLogin = account.accountId
      } catch {
        // ignore
      }
    }

    return {
      id: dbUser.id,
      name: dbUser.name || githubLogin || dbUser.email,
      email: dbUser.email,
      image: dbUser.image,
      githubLogin,
      githubAvatarUrl,
    }
  } catch (error) {
    console.error("getDashboardUserProfile failed:", error)
    return null
  }
}

/**
 * Organizations for the sidebar switcher:
 * - personal GitHub account row
 * - Supercode orgs the user belongs to
 * - GitHub orgs the user is a member of (display / future connect)
 */
export async function getDashboardOrganizations(): Promise<{
  user: DashboardUserProfile | null
  organizations: DashboardOrganization[]
  currentOrganizationId: string | null
} | null> {
  try {
    const sessionUser = await requireSessionUser()
    const profile = await getDashboardUserProfile()
    if (!profile) {
      return { user: null, organizations: [], currentOrganizationId: null }
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: {
        organizationId: true,
        organization: {
          select: { id: true, name: true, slug: true },
        },
      },
    })

    // Orgs where this user is a member (Prisma reverse relation)
    const memberOrgs = await prisma.organization.findMany({
      where: {
        users: { some: { id: sessionUser.id } },
      },
      select: { id: true, name: true, slug: true },
      orderBy: { createdAt: "asc" },
    })

    const currentOrganizationId = dbUser?.organizationId ?? null
    const organizations: DashboardOrganization[] = []

    // Personal account row (GitHub user)
    organizations.push({
      id: `personal:${profile.id}`,
      name: profile.githubLogin || profile.name,
      slug: profile.githubLogin || "personal",
      kind: "personal",
      avatarUrl: profile.githubAvatarUrl || profile.image,
      isCurrent: !currentOrganizationId,
    })

    const seen = new Set<string>([profile.id])

    for (const org of memberOrgs) {
      if (seen.has(org.id)) continue
      seen.add(org.id)
      organizations.push({
        id: org.id,
        name: org.name,
        slug: org.slug,
        kind: "supercode",
        avatarUrl: null,
        isCurrent: org.id === currentOrganizationId,
      })
    }

    // If current org isn't in member list (edge case), still surface it
    if (
      dbUser?.organization &&
      !seen.has(dbUser.organization.id)
    ) {
      organizations.push({
        id: dbUser.organization.id,
        name: dbUser.organization.name,
        slug: dbUser.organization.slug,
        kind: "supercode",
        avatarUrl: null,
        isCurrent: true,
      })
    }

    // GitHub organizations (best-effort)
    try {
      const token = await getGithubToken()
      const octokit = new Octokit({ auth: token })
      const { data: ghOrgs } = await octokit.rest.orgs.listForAuthenticatedUser({
        per_page: 50,
      })
      for (const gh of ghOrgs) {
        const key = `github:${gh.login}`
        if (seen.has(key)) continue
        // Skip if a supercode org already mirrors this name/slug
        if (
          organizations.some(
            (o) =>
              o.slug === gh.login.toLowerCase() ||
              o.name.toLowerCase() === gh.login.toLowerCase(),
          )
        ) {
          continue
        }
        seen.add(key)
        organizations.push({
          id: key,
          name: gh.login,
          slug: gh.login,
          kind: "github",
          avatarUrl: gh.avatar_url,
          isCurrent: false,
        })
      }
    } catch (error) {
      if (!isGithubReauthRequiredError(error)) {
        console.warn("[dashboard] list GitHub orgs failed:", error)
      }
    }

    // Prefer marking current supercode org; if none, personal stays current
    if (currentOrganizationId) {
      for (const org of organizations) {
        org.isCurrent = org.id === currentOrganizationId
      }
    }

    return {
      user: profile,
      organizations,
      currentOrganizationId,
    }
  } catch (error) {
    console.error("getDashboardOrganizations failed:", error)
    return null
  }
}

export async function createOrganization(name: string): Promise<{
  success: true
  organization: { id: string; name: string; slug: string }
} | {
  success: false
  error: string
}> {
  try {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length < 2) {
      return { success: false, error: "Organization name is required" }
    }
    if (trimmed.length > 80) {
      return { success: false, error: "Organization name is too long" }
    }

    const sessionUser = await requireSessionUser()
    const baseSlug = slugify(trimmed)
    const slug = await uniqueOrgSlug(baseSlug)

    const org = await prisma.organization.create({
      data: {
        name: trimmed,
        slug,
        users: {
          connect: { id: sessionUser.id },
        },
      },
      select: { id: true, name: true, slug: true },
    })

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { organizationId: org.id },
    })

    revalidatePath("/dashboard", "layout")
    return { success: true, organization: org }
  } catch (error) {
    console.error("createOrganization failed:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create organization",
    }
  }
}

export async function selectOrganization(organizationId: string): Promise<{
  success: true
} | {
  success: false
  error: string
}> {
  try {
    const sessionUser = await requireSessionUser()

    // Personal account — clear current org pointer
    if (organizationId.startsWith("personal:")) {
      await prisma.user.update({
        where: { id: sessionUser.id },
        data: { organizationId: null },
      })
      revalidatePath("/dashboard", "layout")
      return { success: true }
    }

// Selecting a GitHub org creates/switches to a matching Supercode org
    if (organizationId.startsWith("github:")) {
      const login = organizationId.slice("github:".length).trim()
      if (!login) {
        return { success: false, error: "Invalid GitHub organization" }
      }

      const existing = await prisma.organization.findFirst({
        where: {
          OR: [
            { slug: login.toLowerCase() },
            { name: { equals: login, mode: "insensitive" } },
          ],
          users: { some: { id: sessionUser.id } },
        },
        select: { id: true },
      })

      let orgId = existing?.id
      if (!orgId) {
        const slug = await uniqueOrgSlug(slugify(login))
        const created = await prisma.organization.create({
          data: {
            name: login,
            slug,
            users: { connect: { id: sessionUser.id } },
          },
          select: { id: true },
        })
        orgId = created.id
      }

      await prisma.user.update({
        where: { id: sessionUser.id },
        data: { organizationId: orgId },
      })
      revalidatePath("/dashboard", "layout")
      return { success: true }
    }

    const org = await prisma.organization.findFirst({
      where: {
        id: organizationId,
        users: { some: { id: sessionUser.id } },
      },
      select: { id: true },
    })
    if (!org) {
      return { success: false, error: "Organization not found" }
    }

    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { organizationId: org.id },
    })

    revalidatePath("/dashboard", "layout")
    return { success: true }
  } catch (error) {
    console.error("selectOrganization failed:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to switch organization",
    }
  }
}

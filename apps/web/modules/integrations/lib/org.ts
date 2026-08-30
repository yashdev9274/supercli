import prisma from "@super/db"

/**
 * Ensure the user has a personal Organization and return its id.
 * Auto-creates one org per connecting user (Phase 1 single-tenant-per-user model).
 */
export async function ensureUserOrganization(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      organizationId: true,
    },
  })

  if (!user) {
    throw new Error("User not found")
  }

  if (user.organizationId) {
    return user.organizationId
  }

  const baseSlug = slugify(user.email?.split("@")[0] || user.name || user.id)
  const slug = await uniqueOrgSlug(baseSlug)

  const org = await prisma.organization.create({
    data: {
      name: user.name?.trim() || user.email || "Personal",
      slug,
      users: {
        connect: { id: userId },
      },
    },
    select: { id: true },
  })

  // Keep user.organizationId in sync (connect above should set it via relation,
  // but explicit update is safer if Prisma relation side differs).
  await prisma.user.update({
    where: { id: userId },
    data: { organizationId: org.id },
  })

  return org.id
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

export async function getOrganizationIdForUser(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  })
  return user?.organizationId ?? null
}

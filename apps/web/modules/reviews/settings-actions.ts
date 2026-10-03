"use server"

import { auth } from "@super/auth/server"
import prisma from "@super/db"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import { parseReviewSettings, reviewSettingsSchema } from "./review-settings"

export async function getReviewSettingsRepositories() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) {
    return {
      success: false as const,
      error: "Sign in to manage review settings.",
    }
  }

  try {
    const repositories = await prisma.repository.findMany({
      where: { userId: session.user.id },
      select: { id: true, fullName: true, reviewSettings: true },
      orderBy: { fullName: "asc" },
    })
    return {
      success: true as const,
      repositories: repositories.map((repository) => ({
        id: repository.id,
        fullName: repository.fullName,
        settings: parseReviewSettings(repository.reviewSettings),
      })),
    }
  } catch (error) {
    const missingColumn =
      error !== null &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2022"
    return {
      success: false as const,
      error: missingColumn
        ? "Review settings require a database migration. Apply the review settings migration, then try again."
        : "Review settings could not be loaded. Please try again.",
    }
  }
}

export async function saveReviewSettings(repositoryId: string, input: unknown) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user)
    return {
      success: false as const,
      error: "Sign in to save review settings.",
    }

  if (
    typeof repositoryId !== "string" ||
    !repositoryId.trim() ||
    repositoryId.length > 200
  ) {
    return { success: false as const, error: "Select a valid repository." }
  }

  const result = reviewSettingsSchema.safeParse(input)
  if (!result.success)
    return {
      success: false as const,
      error:
        "Some review settings are invalid. Check your inputs and try again.",
    }

  try {
    const updated = await prisma.repository.updateMany({
      where: { id: repositoryId, userId: session.user.id },
      data: { reviewSettings: result.data },
    })
    if (updated.count !== 1)
      return {
        success: false as const,
        error: "Repository not found or you do not have access.",
      }

    revalidatePath("/dashboard/review-settings")
    return { success: true as const, settings: result.data }
  } catch {
    return {
      success: false as const,
      error:
        "Settings could not be saved. Your changes are still here; try again.",
    }
  }
}

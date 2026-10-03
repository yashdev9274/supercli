import { z } from "zod"

export const reviewSettingsSchema = z.strictObject({
  automaticReviews: z.enum(["never", "opened", "pushes", "all"]).default("all"),
  reviewDrafts: z.boolean().default(false),
  excludedAuthors: z
    .array(z.string().trim().min(1).max(100))
    .max(50)
    .default([]),
  updateDescription: z.boolean().default(true),
  imageBadges: z.boolean().default(true),
  includeSummary: z.boolean().default(true),
  summaryCollapsible: z.boolean().default(false),
  summaryDefaultOpen: z.boolean().default(false),
  includeConfidence: z.boolean().default(false),
  includeFindings: z.boolean().default(true),
  includeSequenceDiagram: z.boolean().default(false),
  diagramCollapsible: z.boolean().default(false),
  diagramDefaultOpen: z.boolean().default(false),
  instructions: z.string().max(8000).default(""),
  strictness: z.enum(["low", "medium", "high"]).default("low"),
  commentHeader: z.string().max(2000).default(""),
})

export type ReviewSettings = z.infer<typeof reviewSettingsSchema>

export const DEFAULT_REVIEW_SETTINGS: ReviewSettings =
  reviewSettingsSchema.parse({})

export function parseReviewSettings(value: unknown): ReviewSettings {
  const result = reviewSettingsSchema.safeParse(value ?? {})
  return result.success ? result.data : reviewSettingsSchema.parse({})
}

export function shouldReviewPullRequest(
  settings: ReviewSettings,
  event: { action: string; draft: boolean; author?: string },
): boolean {
  if (settings.automaticReviews === "never") return false
  if (event.draft && !settings.reviewDrafts) return false
  if (
    event.author &&
    settings.excludedAuthors.some(
      (author) => author.toLowerCase() === event.author?.toLowerCase(),
    )
  )
    return false

  const opened = ["opened", "reopened", "ready_for_review"].includes(
    event.action,
  )
  const pushed = event.action === "synchronize"
  if (settings.automaticReviews === "opened") return opened
  if (settings.automaticReviews === "pushes") return pushed
  return opened || pushed
}

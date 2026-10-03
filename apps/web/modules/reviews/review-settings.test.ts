import { describe, expect, test } from "bun:test"

import {
  DEFAULT_REVIEW_SETTINGS,
  parseReviewSettings,
  reviewSettingsSchema,
  shouldReviewPullRequest,
} from "./review-settings"

describe("review settings", () => {
  test("keeps the previous review behavior for repositories without preferences", () => {
    expect(parseReviewSettings(null)).toEqual(DEFAULT_REVIEW_SETTINGS)
    expect(DEFAULT_REVIEW_SETTINGS.automaticReviews).toBe("all")
    expect(DEFAULT_REVIEW_SETTINGS.reviewDrafts).toBe(false)
    expect(DEFAULT_REVIEW_SETTINGS.updateDescription).toBe(true)
    expect(DEFAULT_REVIEW_SETTINGS.strictness).toBe("low")
  })

  test("fills missing settings while preserving stored preferences", () => {
    const settings = parseReviewSettings({
      includeSummary: false,
      instructions: "Check authorization",
    })
    expect(settings.includeSummary).toBe(false)
    expect(settings.instructions).toBe("Check authorization")
    expect(settings.includeFindings).toBe(true)
  })

  test("rejects malformed settings and unsupported fields", () => {
    expect(
      reviewSettingsSchema.safeParse({ strictness: "critical" }).success,
    ).toBe(false)
    expect(
      reviewSettingsSchema.safeParse({ includeSummary: "false" }).success,
    ).toBe(false)
    expect(reviewSettingsSchema.safeParse({ autoApprove: true }).success).toBe(
      false,
    )
    expect(
      reviewSettingsSchema.safeParse({ instructions: "x".repeat(8001) })
        .success,
    ).toBe(false)
    expect(
      reviewSettingsSchema.safeParse({ commentHeader: "x".repeat(2001) })
        .success,
    ).toBe(false)
    expect(
      reviewSettingsSchema.safeParse({ excludedAuthors: Array(51).fill("bot") })
        .success,
    ).toBe(false)
    expect(parseReviewSettings({ strictness: "invalid" })).toEqual(
      DEFAULT_REVIEW_SETTINGS,
    )
  })
})

describe("automatic review triggers", () => {
  test("matches the existing supported actions", () => {
    for (const action of [
      "opened",
      "reopened",
      "synchronize",
      "ready_for_review",
    ]) {
      expect(
        shouldReviewPullRequest(DEFAULT_REVIEW_SETTINGS, {
          action,
          draft: false,
        }),
      ).toBe(true)
    }
    for (const action of [
      "closed",
      "edited",
      "labeled",
      "converted_to_draft",
    ]) {
      expect(
        shouldReviewPullRequest(DEFAULT_REVIEW_SETTINGS, {
          action,
          draft: false,
        }),
      ).toBe(false)
    }
  })

  test("never mode excludes every automatic event", () => {
    expect(
      shouldReviewPullRequest(
        { ...DEFAULT_REVIEW_SETTINGS, automaticReviews: "never" },
        { action: "opened", draft: false },
      ),
    ).toBe(false)
  })

  test("opened mode includes reopen and ready-for-review but excludes pushes", () => {
    const settings = {
      ...DEFAULT_REVIEW_SETTINGS,
      automaticReviews: "opened" as const,
    }
    for (const action of ["opened", "reopened", "ready_for_review"]) {
      expect(shouldReviewPullRequest(settings, { action, draft: false })).toBe(
        true,
      )
    }
    expect(
      shouldReviewPullRequest(settings, {
        action: "synchronize",
        draft: false,
      }),
    ).toBe(false)
  })

  test("push mode excludes initial opens", () => {
    const settings = {
      ...DEFAULT_REVIEW_SETTINGS,
      automaticReviews: "pushes" as const,
    }
    expect(
      shouldReviewPullRequest(settings, { action: "opened", draft: false }),
    ).toBe(false)
    expect(
      shouldReviewPullRequest(settings, {
        action: "synchronize",
        draft: false,
      }),
    ).toBe(true)
  })

  test("draft review is opt-in", () => {
    expect(
      shouldReviewPullRequest(DEFAULT_REVIEW_SETTINGS, {
        action: "opened",
        draft: true,
      }),
    ).toBe(false)
    expect(
      shouldReviewPullRequest(
        { ...DEFAULT_REVIEW_SETTINGS, reviewDrafts: true },
        { action: "opened", draft: true },
      ),
    ).toBe(true)
  })

  test("author exclusions are case-insensitive exact matches", () => {
    const settings = {
      ...DEFAULT_REVIEW_SETTINGS,
      excludedAuthors: ["dependabot[bot]", "Yash"],
    }
    expect(
      shouldReviewPullRequest(settings, {
        action: "opened",
        draft: false,
        author: "Dependabot[bot]",
      }),
    ).toBe(false)
    expect(
      shouldReviewPullRequest(settings, {
        action: "opened",
        draft: false,
        author: "YASH",
      }),
    ).toBe(false)
    expect(
      shouldReviewPullRequest(settings, {
        action: "opened",
        draft: false,
        author: "yashdev9274",
      }),
    ).toBe(true)
  })
})

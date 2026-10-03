import { beforeEach, describe, expect, mock, test } from "bun:test"

import {
  INLINE_FINDINGS_END,
  INLINE_FINDINGS_START,
  type ReviewFinding,
} from "../ai/lib/inline-review-findings"
import { DEFAULT_REVIEW_SETTINGS } from "./review-settings"

const userId = "user-12345"
let settingsValue: unknown = null
let existingStickyComment = false
const findings: ReviewFinding[] = [
  "critical",
  "high",
  "medium",
  "low",
  "nit",
].map((severity, index) => ({
  severity: severity as ReviewFinding["severity"],
  title: `${severity} finding`,
  body: `Actionable ${severity} defect.`,
  path: "src/auth.ts",
  line: index + 1,
  side: "RIGHT",
}))
const fullReview = [
  "### Summary\nFull dashboard summary.",
  "### PR description summary\nBug Fixes\n- Scope authorization.",
  "### Walkthrough\n- Updates auth.",
  "### Findings\nConcrete actionable findings.",
  "### Risk assessment\n**Medium** — authorization.",
  "### Test plan\n- [ ] Verify access.",
  "### Suggested PR description\nPreserved dashboard description.",
  "### Confidence Score\n4/5 — no runtime verification.",
  "### Sequence Diagram\n```mermaid\nsequenceDiagram\nClient->>API: authorize\n```",
].join("\n\n")
let generatedReview = fullReview
let generatedFindings = findings
const originalDescription =
  "Author's original description.\n\n<!-- supercode-review-summary:start -->\nExisting summary\n<!-- supercode-review-summary:end -->"

const repositoryFindFirst = mock<
  (input: {
    where: { owner: string; name: string; userId?: string }
  }) => Promise<{ id: string; userId: string; reviewSettings: unknown }>
>(async () => ({ id: "repository-1", userId, reviewSettings: settingsValue }))
const reviewUpsert = mock<
  (input: {
    update: Record<string, unknown>
    create: Record<string, unknown>
  }) => Promise<{ id: string }>
>(async () => ({ id: "review-1" }))
const createComment = mock<
  (input: { body: string }) => Promise<{ data: { id: number } }>
>(async () => ({ data: { id: 100 } }))
const updateComment = mock<
  (input: {
    body: string
    comment_id: number
  }) => Promise<{ data: { id: number } }>
>(async () => ({ data: { id: 99 } }))
const updatePull = mock<(input: { body: string }) => Promise<{ data: object }>>(
  async () => ({ data: {} }),
)
const createReview = mock<
  (input: {
    body: string
    comments: Array<{ body: string; line: number }>
  }) => Promise<{ data: { id: number } }>
>(async () => ({ data: { id: 200 } }))
const deleteReviewComment = mock<
  (input: { comment_id: number }) => Promise<{ data: object }>
>(async () => ({ data: {} }))
const generateText = mock<
  (input: { prompt: string }) => Promise<{ text: string }>
>(async () => ({
  text: `${generatedReview}\n${INLINE_FINDINGS_START}\n${JSON.stringify({ findings: generatedFindings })}\n${INLINE_FINDINGS_END}`,
}))

mock.module("@super/db", () => ({
  default: {
    repository: { findFirst: repositoryFindFirst },
    review: { upsert: reviewUpsert },
    account: {
      findFirst: async () => ({
        id: "account-1",
        userId,
        accessToken: "test-token",
        refreshToken: null,
        accessTokenExpiresAt: null,
      }),
    },
  },
}))
mock.module("@/lib/auth", () => ({ auth: { api: {} } }))
mock.module("next/headers", () => ({ headers: async () => new Headers() }))
mock.module("octokit", () => ({
  Octokit: class {
    rest = {
      issues: {
        listComments: async () => ({
          data: existingStickyComment
            ? [{ id: 99, body: "<!-- supercode-ai-review -->\nOld review." }]
            : [],
        }),
        createComment,
        updateComment,
      },
      pulls: {
        get: async (input: { mediaType?: { format: string } }) => ({
          data:
            input.mediaType?.format === "diff"
              ? "diff --git a/src/auth.ts b/src/auth.ts\n+const value = true"
              : {
                  title: "Scope authorization",
                  body: originalDescription,
                  head: { sha: "current-head" },
                  base: { sha: "base-head" },
                  user: { login: "author" },
                  additions: 5,
                  deletions: 0,
                  draft: false,
                },
        }),
        listFiles: async () => ({
          data: [
            {
              filename: "src/auth.ts",
              status: "modified",
              additions: 5,
              deletions: 0,
              patch: "@@ -0,0 +1,5 @@\n+one\n+two\n+three\n+four\n+five",
            },
          ],
        }),
        listReviewComments: async () => ({
          data: [
            {
              id: 300,
              body: "<!-- supercode-inline-review-comment -->\nOld finding.",
            },
          ],
        }),
        createReview,
        deleteReviewComment,
        update: updatePull,
      },
    }
  },
}))
mock.module("ai", () => ({ generateText }))
mock.module("@/lib/gateway", () => ({
  chatModel: () => "mock-model",
  gatewayProviderChain: () => ["vercel"],
  providerSupportsModel: () => true,
}))
mock.module("@/modules/pinecone/rag", () => ({
  retrieveContext: async () => [],
}))
mock.module("@/modules/billing/review-credits", () => ({
  markReviewCreditRunning: async () => {},
  settleReviewCredit: async () => {},
}))
mock.module("@/modules/integrations/lib/linear", () => ({
  notifyLinearOfCompletedReview: async () => ({
    skipped: true,
    reason: "test",
  }),
}))
mock.module("@/modules/email/pr-review-email", () => ({
  notifyUserOfCompletedReview: async () => ({ skipped: true, reason: "test" }),
}))

const { buildReviewPrompt, extractPrDescriptionSummary, runGeneratePrReview } =
  await import("../ai/lib/generate-pr-review")
const { postInlineReviewComments, postReviewComment } =
  await import("../github/lib/github")
const promptInput = {
  owner: "acme",
  repo: "api",
  prNumber: 42,
  title: "Scope authorization",
  description: "Fix access checks.",
  author: "author",
  additions: 5,
  deletions: 0,
  fileSummary: "src/auth.ts",
  contextBlocks: [],
  diff: "+const value = true",
}
const runInput = { owner: "acme", repo: "api", prNumber: 42, userId }

beforeEach(() => {
  settingsValue = null
  existingStickyComment = false
  generatedReview = fullReview
  generatedFindings = findings
  for (const fn of [
    repositoryFindFirst,
    reviewUpsert,
    createComment,
    updateComment,
    updatePull,
    createReview,
    deleteReviewComment,
    generateText,
  ]) {
    fn.mockClear()
  }
})

describe("settings-aware review prompt", () => {
  test("keeps default sections and all actionable severity levels", () => {
    const prompt = buildReviewPrompt(promptInput)
    expect(prompt).toContain(
      "Report actionable defects at all severity levels: critical, high, medium, low, and nit.",
    )
    expect(prompt).toContain("### Summary")
    expect(prompt).toContain("### Findings")
    expect(prompt).not.toContain("### Confidence Score")
    expect(prompt).not.toContain("### Sequence Diagram")
  })

  test("applies additional guidance and enables scored confidence and Mermaid", () => {
    const prompt = buildReviewPrompt({
      ...promptInput,
      settings: {
        ...DEFAULT_REVIEW_SETTINGS,
        instructions: "  Focus on tenant boundaries.  ",
        strictness: "high",
        includeConfidence: true,
        includeSequenceDiagram: true,
      },
    })
    expect(prompt).toContain(
      "## Additional repository review guidance\nFocus on tenant boundaries.",
    )
    expect(prompt).toContain(
      "Report only critical and high severity actionable defects.",
    )
    expect(prompt).toContain("### Confidence Score\nGive a score from 1–5")
    expect(prompt).toContain("with a concise justification")
    expect(prompt).toContain(
      "### Sequence Diagram\nInclude only a fenced `mermaid` code block",
    )
    expect(prompt).not.toContain("Do not include a Sequence Diagram")
  })

  test("sets the medium threshold without omitting stored review sections", () => {
    const prompt = buildReviewPrompt({
      ...promptInput,
      settings: {
        ...DEFAULT_REVIEW_SETTINGS,
        strictness: "medium",
        includeSummary: false,
        includeFindings: false,
      },
    })
    expect(prompt).toContain(
      "Report only critical, high, and medium severity actionable defects.",
    )
    expect(prompt).toContain("### Summary")
    expect(prompt).toContain("### Findings")
  })

  test("extracts description-only content without splitting on fenced headings", () => {
    const source =
      "### PR description summary\nBug Fixes\n```md\n### Findings\nExample\n```\n### Summary\nActual summary."
    expect(extractPrDescriptionSummary(source)).toBe(
      "Bug Fixes\n```md\n### Findings\nExample\n```",
    )
    expect(
      extractPrDescriptionSummary(
        "### Findings\n```md\n### PR description summary\nNot a section\n```",
      ),
    ).toBeNull()
  })
})

describe("repository settings in the review pipeline", () => {
  test("applies the saved settings when updating an original sticky GitHub review", async () => {
    existingStickyComment = true
    settingsValue = {
      ...DEFAULT_REVIEW_SETTINGS,
      includeSequenceDiagram: true,
      includeConfidence: true,
      imageBadges: false,
      commentHeader: "**Repository policy**",
      updateDescription: false,
    }
    const result = await runGeneratePrReview(runInput)
    expect(result.commentPosted).toBe(true)
    expect(createComment).not.toHaveBeenCalled()
    expect(updateComment).toHaveBeenCalledTimes(1)
    expect(updateComment.mock.calls[0][0].comment_id).toBe(99)
    const body = updateComment.mock.calls[0][0].body
    expect(body).toContain("**Repository policy**")
    expect(body).toContain("### Confidence Score")
    expect(body).toContain("### Sequence Diagram")
    expect(body).toContain("```mermaid\nsequenceDiagram")
    expect(body).not.toContain("🤖")
    expect(updatePull).not.toHaveBeenCalled()
  })

  test("generates an omitted diagram and publishes it in the sticky GitHub comment", async () => {
    settingsValue = {
      ...DEFAULT_REVIEW_SETTINGS,
      includeSequenceDiagram: true,
      diagramCollapsible: true,
      diagramDefaultOpen: true,
    }
    const withoutDiagram = fullReview.slice(
      0,
      fullReview.indexOf("\n\n### Sequence Diagram"),
    )
    generateText.mockImplementationOnce(async () => ({ text: withoutDiagram }))
    generateText.mockImplementationOnce(async () => ({
      text: "```mermaid\nsequenceDiagram\nClient->>API: Authorize request\nAPI-->>Client: Respond\n```",
    }))
    const result = await runGeneratePrReview(runInput)
    expect(generateText).toHaveBeenCalledTimes(2)
    expect(generateText.mock.calls[1][0].prompt).toContain(
      "diff --git a/src/auth.ts",
    )
    expect(result.review).toContain(
      "### Sequence Diagram\n\n```mermaid\nsequenceDiagram",
    )
    expect(createComment.mock.calls[0][0].body).toContain(
      "<details open>\n<summary>Sequence diagram</summary>",
    )
    expect(createComment.mock.calls[0][0].body).toContain(
      "Client->>API: Authorize request",
    )
    expect(reviewUpsert.mock.calls[1][0]).toMatchObject({
      update: { review: result.review },
    })
  })

  test("repairs an invalid diagram before publishing the review", async () => {
    settingsValue = { ...DEFAULT_REVIEW_SETTINGS, includeSequenceDiagram: true }
    generateText.mockImplementationOnce(async () => ({
      text: "### Summary\nReview.\n### Sequence Diagram\n```mermaid\nsequenceDiagram\nClient->>\n```",
    }))
    generateText.mockImplementationOnce(async () => ({
      text: "```mermaid\nsequenceDiagram\nClient->>API: Request\n```",
    }))
    await runGeneratePrReview(runInput)
    expect(generateText).toHaveBeenCalledTimes(2)
    expect(createComment.mock.calls[0][0].body).toContain(
      "Client->>API: Request",
    )
    expect(createComment.mock.calls[0][0].body).not.toContain("Client->>\n")
  })

  test("does not make a diagram generation request when the section is disabled", async () => {
    const result = await runGeneratePrReview(runInput)
    expect(generateText).toHaveBeenCalledTimes(1)
    expect(result.commentPosted).toBe(true)
    expect(createComment.mock.calls[0][0].body).not.toContain("```mermaid")
  })

  test("enforces strictness in the sticky summary even when the model includes lower-severity findings", async () => {
    settingsValue = { ...DEFAULT_REVIEW_SETTINGS, strictness: "high" }
    generatedReview = fullReview.replace(
      "Concrete actionable findings.",
      "- **[low] Low-only markdown finding** — `src/auth.ts`\n  Minor issue.",
    )
    const result = await runGeneratePrReview(runInput)
    expect(result.review).toContain("Low-only markdown finding")
    const body = createComment.mock.calls[0][0].body
    expect(body).toContain("critical finding")
    expect(body).toContain("high finding")
    expect(body).not.toContain("Low-only markdown finding")
    expect(body).not.toContain("medium finding")
    expect(body).not.toContain("nit finding")
  })

  test("stores the full review and publishes only selected content without modifying the description", async () => {
    settingsValue = {
      ...DEFAULT_REVIEW_SETTINGS,
      includeSummary: false,
      includeConfidence: true,
      includeSequenceDiagram: true,
      diagramCollapsible: true,
      diagramDefaultOpen: true,
      updateDescription: false,
      imageBadges: false,
      strictness: "high",
      instructions: "Check tenant boundaries.",
      commentHeader: "Team review policy",
    }
    const result = await runGeneratePrReview(runInput)

    expect(result.review).toBe(fullReview)
    expect(result.inlineCommentsPosted).toBe(2)
    expect(result.descriptionUpdated).toBe(false)
    expect(reviewUpsert.mock.calls[1][0]).toMatchObject({
      update: { review: fullReview, status: "completed" },
    })
    expect(repositoryFindFirst.mock.calls[1][0]).toMatchObject({
      where: { owner: "acme", name: "api", userId },
    })
    expect(generateText.mock.calls[0][0]).toMatchObject({
      prompt: expect.stringContaining("Check tenant boundaries."),
    })
    expect(updatePull).not.toHaveBeenCalled()
    const body = createComment.mock.calls[0][0].body
    expect(body).toStartWith(
      "<!-- supercode-ai-review -->\nTeam review policy\n\n## Supercode AI Review",
    )
    expect(body).toContain("### Findings")
    expect(body).toContain("### Confidence Score")
    expect(body).toContain(
      "<details open>\n<summary>Sequence diagram</summary>",
    )
    expect(body).not.toContain("### Summary")
    expect(body).not.toContain("### PR description summary")
    expect(body).not.toContain("🤖")
    expect(body).not.toContain("👍")
    expect(body).toContain("Automated review by [Supercode]")
    const inline = createReview.mock.calls[0][0].comments
    expect(inline.map((comment: { line: number }) => comment.line)).toEqual([
      1, 2,
    ])
    expect(inline[0].body).toStartWith(
      "<!-- supercode-inline-review-comment -->\nTeam review policy\n\n**P1",
    )
    expect(createReview.mock.calls[0][0].body).toStartWith(
      "Team review policy\n\n",
    )
  })

  test.each([
    ["low", 5],
    ["medium", 3],
    ["high", 2],
  ] as const)(
    "filters model findings server-side at %s strictness",
    async (strictness, count) => {
      settingsValue = {
        ...DEFAULT_REVIEW_SETTINGS,
        strictness,
        includeFindings: false,
      }
      const result = await runGeneratePrReview(runInput)
      expect(result.inlineCommentsPosted).toBe(count)
      expect(createReview.mock.calls[0][0].comments).toHaveLength(count)
      expect(createComment.mock.calls[0][0].body).not.toContain("### Findings")
      expect(result.review).toBe(fullReview)
    },
  )

  test("uses defaults for a repository without settings and preserves author description text", async () => {
    const result = await runGeneratePrReview(runInput)
    expect(result.inlineCommentsPosted).toBe(5)
    expect(result.descriptionUpdated).toBe(true)
    expect(updatePull.mock.calls[0][0].body).toStartWith(
      "Author's original description.",
    )
    expect(updatePull.mock.calls[0][0].body).toContain(
      "Bug Fixes\n- Scope authorization.",
    )
    expect(updatePull.mock.calls[0][0].body).not.toContain("Existing summary")
    expect(createComment.mock.calls[0][0].body).toContain(
      "## 🤖 Supercode AI Review",
    )
    expect(createComment.mock.calls[0][0].body).toContain("👍/👎")
    expect(createComment.mock.calls[0][0].body).not.toContain(
      "### Confidence Score",
    )
    expect(createComment.mock.calls[0][0].body).not.toContain(
      "### Sequence Diagram",
    )
  })

  test("can hide all sticky comment sections while preserving inline findings and the full stored review", async () => {
    settingsValue = {
      ...DEFAULT_REVIEW_SETTINGS,
      includeSummary: false,
      includeFindings: false,
    }
    const result = await runGeneratePrReview(runInput)
    expect(result.review).toBe(fullReview)
    expect(result.inlineCommentsPosted).toBe(5)
    expect(createReview.mock.calls[0][0].comments).toHaveLength(5)
    expect(createComment.mock.calls[0][0].body).toContain(
      "Review complete. See inline comments for any actionable findings.",
    )
    expect(createComment.mock.calls[0][0].body).not.toContain("### Findings")
    expect(result.descriptionUpdated).toBe(true)
    expect(updatePull.mock.calls[0][0].body).toContain(
      "Bug Fixes\n- Scope authorization.",
    )
  })

  test("filters before diff-anchor deduplication so excluded findings cannot suppress high severity ones", async () => {
    settingsValue = { ...DEFAULT_REVIEW_SETTINGS, strictness: "high" }
    generatedFindings = [{ ...findings[3], line: 2 }, findings[1]]
    const result = await runGeneratePrReview(runInput)
    expect(result.inlineCommentsPosted).toBe(1)
    expect(createReview.mock.calls[0][0].comments[0].body).toContain("HIGH")
  })
})

describe("backwards-compatible GitHub publishing options", () => {
  test("updates the existing sticky marker and preserves the default branding and footer", async () => {
    existingStickyComment = true
    await postReviewComment(
      "test-token",
      "acme",
      "api",
      42,
      "### Summary\nComplete.",
      { headSha: "current-head", event: "COMMENT" },
    )
    expect(createComment).not.toHaveBeenCalled()
    expect(updateComment.mock.calls[0][0]).toMatchObject({ comment_id: 99 })
    expect(updateComment.mock.calls[0][0].body).toStartWith(
      "<!-- supercode-ai-review -->\n## 🤖 Supercode AI Review",
    )
    expect(updateComment.mock.calls[0][0].body).toContain(
      "Automated review by [Supercode]",
    )
  })

  test("accepts inline comments without new options and cleans up previous marker-owned findings", async () => {
    expect(
      await postInlineReviewComments(
        "test-token",
        "acme",
        "api",
        42,
        "current-head",
        [findings[1]],
      ),
    ).toBe(1)
    expect(createReview.mock.calls[0][0].comments[0].body).toStartWith(
      "<!-- supercode-inline-review-comment -->\n**P1 · HIGH",
    )
    expect(deleteReviewComment.mock.calls[0][0]).toMatchObject({
      comment_id: 300,
    })
  })
})

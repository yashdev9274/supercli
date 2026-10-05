import prisma from "@super/db"
import {
  markReviewCreditRunning,
  settleReviewCredit,
} from "@/modules/billing/review-credits"
import {
  getPullRequestDiff,
  postInlineReviewComments,
  postReviewComment,
  updatePullRequestSummary,
} from "@/modules/github/lib/github"
import {
  buildReviewPrompt,
  finalizeReviewText,
  generateReviewText,
} from "./pr-review-generation"

export { buildReviewPrompt } from "./pr-review-generation"
import { retrieveContext } from "@/modules/pinecone/rag"
import {
  parseReviewSettings,
} from "@/modules/reviews/review-settings"
import {
  formatReviewSummary,
  parseReviewSections,
  replaceReviewSection,
} from "@/modules/reviews/review-summary"
export function extractPrDescriptionSummary(review: string): string | null {
  return parseReviewSections(review).find(
    (section) => section.heading.toLowerCase() === "pr description summary",
  )?.content || null
}

export type GeneratePrReviewInput = {
  owner: string
  repo: string
  prNumber: number
  userId: string
  reviewRunId?: string
  headSha?: string
}

export type GeneratePrReviewResult = {
  success: true
  owner: string
  repo: string
  prNumber: number
  files: number
  commentPosted: boolean
  inlineCommentsPosted?: number
  descriptionUpdated?: boolean
  review: string
  linearNotified?: boolean
  linearIssueId?: string | null
  linearSkippedReason?: string | null
  emailNotified?: boolean
  emailId?: string | null
  emailSkippedReason?: string | null
}

function isRealUserId(userId: string | undefined | null): userId is string {
  if (!userId) return false
  // Guard against diagnostic / malformed event payloads (e.g. earlier probe sends).
  if (userId === "probe" || userId === "unknown" || userId === "test") return false
  return userId.length >= 8
}

async function findRepository(owner: string, repo: string, userId?: string) {
  if (isRealUserId(userId)) {
    const scoped = await prisma.repository.findFirst({
      where: { owner, name: repo, userId },
    })
    if (scoped) return scoped
  }
  return prisma.repository.findFirst({
    where: { owner, name: repo },
  })
}

/**
 * Resolve a usable GitHub OAuth access token for PR fetch/comment.
 * Prefer the connected repository owner's token — event.userId can be stale
 * or invalid (Inngest retries of probe events, multi-user same-repo, etc.).
 */
async function resolveGithubAccessToken(input: {
  owner: string
  repo: string
  userId?: string
}): Promise<{ accessToken: string; userId: string }> {
  const { getGithubTokenForUser } = await import("@/modules/github/lib/github")
  const repository = await findRepository(input.owner, input.repo, input.userId)

  const candidateUserIds = [
    repository?.userId,
    isRealUserId(input.userId) ? input.userId : undefined,
  ].filter((id): id is string => Boolean(id))

  // De-dupe while preserving order
  const seen = new Set<string>()
  const errors: string[] = []

  for (const candidate of candidateUserIds) {
    if (seen.has(candidate)) continue
    seen.add(candidate)

    try {
      const accessToken = await getGithubTokenForUser(candidate)
      return { accessToken, userId: candidate }
    } catch (error) {
      errors.push(
        `${candidate}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // Last resort: any user who connected this repo (same owner/name).
  const anyConnected = await prisma.repository.findMany({
    where: { owner: input.owner, name: input.repo },
    select: { userId: true },
    take: 10,
  })

  for (const row of anyConnected) {
    if (seen.has(row.userId)) continue
    seen.add(row.userId)

    try {
      const accessToken = await getGithubTokenForUser(row.userId)
      return { accessToken, userId: row.userId }
    } catch (error) {
      errors.push(
        `${row.userId}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  throw new Error(
    `No GitHub access token found for ${input.owner}/${input.repo}. ` +
      `Reconnect the repository or re-authenticate with GitHub in Supercode.` +
      (errors.length ? ` Attempts: ${errors.join(" | ")}` : ""),
  )
}

export async function markReviewPending(input: GeneratePrReviewInput) {
  const repository = await findRepository(input.owner, input.repo, input.userId)
  if (!repository) return null

  await prisma.review.upsert({
    where: {
      repositoryId_prNumber: {
        repositoryId: repository.id,
        prNumber: input.prNumber,
      },
    },
    update: {
      status: "pending",
    },
    create: {
      repositoryId: repository.id,
      prNumber: input.prNumber,
      prTitle: "Review in progress…",
      prUrl: `https://github.com/${input.owner}/${input.repo}/pull/${input.prNumber}`,
      review: "Review queued.",
      status: "pending",
    },
  })

  return repository.id
}

export async function markReviewFailed(
  input: GeneratePrReviewInput,
  message: string,
) {
  const repository = await findRepository(input.owner, input.repo, input.userId)
  if (!repository) return

  await prisma.review.upsert({
    where: {
      repositoryId_prNumber: {
        repositoryId: repository.id,
        prNumber: input.prNumber,
      },
    },
    update: {
      status: "failed",
      review: `Error: ${message}`,
    },
    create: {
      repositoryId: repository.id,
      prNumber: input.prNumber,
      prTitle: "Review failed",
      prUrl: `https://github.com/${input.owner}/${input.repo}/pull/${input.prNumber}`,
      review: `Error: ${message}`,
      status: "failed",
    },
  })
}

/**
 * Core AI review pipeline. Safe to call from Inngest steps or directly in-process
 * when a background worker is not available (local dev).
 */
export async function runGeneratePrReview(
  input: GeneratePrReviewInput,
): Promise<GeneratePrReviewResult> {
  const { owner, repo, prNumber } = input
  const repoId = `${owner}/${repo}`
  const pipelineStartedAt = Date.now()
  const timings: Record<string, number> = {}
  const measure = async <T>(stage: string, work: () => Promise<T>): Promise<T> => {
    const startedAt = Date.now()
    try {
      return await work()
    } finally {
      timings[stage] = Date.now() - startedAt
    }
  }

  // Resolve token first so we can bind the review to a real connected user
  // even when the Inngest payload carries a bad/stale userId.
  const { accessToken, userId } = await measure("tokenMs", () =>
    resolveGithubAccessToken(input),
  )
  const resolvedInput = { ...input, userId }
  const repository = await findRepository(owner, repo, userId)
  const settings = parseReviewSettings(repository?.reviewSettings)

  if (input.reviewRunId) {
    await measure("creditRunningMs", () => markReviewCreditRunning(input.reviewRunId!))
  }
  await measure("pendingMs", () => markReviewPending(resolvedInput))

  const prData = await measure("githubFetchMs", () =>
    getPullRequestDiff(accessToken, owner, repo, prNumber),
  )
  if (input.headSha && prData.headSha !== input.headSha) {
    throw new Error(
      `Pull request head changed before review started (${input.headSha.slice(0, 7)} → ${prData.headSha.slice(0, 7)}). Queue the latest version.`,
    )
  }

  let context: string[] = []
  try {
    const query = [
      prData.title,
      prData.description,
      ...prData.changedFiles.map((f) => f.filename),
    ]
      .filter(Boolean)
      .join("\n")

    context = await measure("contextMs", () => retrieveContext(query, repoId, 6))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[generate-pr-review] context unavailable: ${message}`)
    context = []
  }

  const fileSummary =
    prData.changedFiles.length === 0
      ? "_No files listed._"
      : prData.changedFiles
          .map(
            (f) =>
              `- \`${f.filename}\` (${f.status}, +${f.additions}/-${f.deletions})`,
          )
          .join("\n")

  const prompt = buildReviewPrompt({
    owner,
    repo,
    prNumber,
    title: prData.title,
    description: prData.description,
    author: prData.author,
    additions: prData.additions,
    deletions: prData.deletions,
    fileSummary,
    contextBlocks: context,
    diff: prData.diff,
    settings,
  })

  const text = await measure("generationMs", () => generateReviewText(prompt))

  const { review, inlineFindings } = await finalizeReviewText(
    text,
    { ...prData, fileSummary },
    settings,
    generateReviewText,
    measure,
  )
  const prUrl = `https://github.com/${owner}/${repo}/pull/${prNumber}`

  let reviewId: string | null = null
  await measure("persistenceMs", async () => {
    if (!repository) {
      console.warn(`[generate-pr-review] repository ${repoId} missing when saving`)
      return
    }

    const saved = await prisma.review.upsert({
      where: {
        repositoryId_prNumber: {
          repositoryId: repository.id,
          prNumber,
        },
      },
      update: {
        prTitle: prData.title,
        prUrl,
        review,
        status: "completed",
      },
      create: {
        repositoryId: repository.id,
        prNumber,
        prTitle: prData.title,
        prUrl,
        review,
        status: "completed",
      },
      select: { id: true },
    })
    reviewId = saved.id
  })

  if (input.reviewRunId && reviewId) {
    await measure("creditSettlementMs", () =>
      settleReviewCredit({ reviewRunId: input.reviewRunId!, reviewId: reviewId! }),
    )
  }

  // Persist completed review first so the dashboard is correct even if GitHub
  // writes fail. All GitHub writes are independent and best-effort.
  let commentPosted = false
  let inlineCommentsPosted = 0
  let descriptionUpdated = false
  const descriptionSummary = extractPrDescriptionSummary(review)
  const publishedReview = settings.strictness === "low"
    ? review
    : replaceReviewSection(review, "Findings", `### Findings\n\n${inlineFindings.length
        ? inlineFindings.map((finding) => `- **[${finding.severity}] ${finding.title}** — \`${finding.path}:${finding.line}\`\n  ${finding.body.replace(/\n/g, "\n  ")}`).join("\n\n")
        : `No validated ${settings.strictness === "high" ? "high or critical" : "medium, high, or critical"} findings to display.`}`)
  const comment = formatReviewSummary(publishedReview, settings)

  await Promise.all([
    measure("githubCommentMs", async () => {
      try {
        await postReviewComment(accessToken, owner, repo, prNumber, comment, {
          headSha: prData.headSha,
          event: "COMMENT",
          imageBadges: settings.imageBadges,
          commentHeader: settings.commentHeader,
        })
        commentPosted = true
      } catch (error) {
        console.error(
          `[generate-pr-review] postReviewComment failed for ${repoId}#${prNumber} (review still saved):`,
          error,
        )
      }
    }),
    measure("githubInlineCommentsMs", async () => {
      if (inlineFindings.length === 0) return
      try {
        inlineCommentsPosted = await postInlineReviewComments(
          accessToken,
          owner,
          repo,
          prNumber,
          prData.headSha,
          inlineFindings,
          { imageBadges: settings.imageBadges, commentHeader: settings.commentHeader },
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.warn(
          `[generate-pr-review] inline comments unavailable for ${repoId}#${prNumber}: ${message}`,
        )
      }
    }),
    measure("githubDescriptionMs", async () => {
      if (!settings.updateDescription) return
      if (!descriptionSummary) {
        console.warn(
          `[generate-pr-review] PR description summary missing for ${repoId}#${prNumber}`,
        )
        return
      }
      try {
        await updatePullRequestSummary(
          accessToken,
          owner,
          repo,
          prNumber,
          descriptionSummary,
        )
        descriptionUpdated = true
      } catch (error) {
        console.error(
          `[generate-pr-review] updatePullRequestSummary failed for ${repoId}#${prNumber} (review still saved):`,
          error,
        )
      }
    }),
  ])

  // Optional notifications are independent. Run them concurrently so their
  // latency is the slower of the two integrations rather than the sum.
  let linearNotified = false
  let linearIssueId: string | null = null
  let linearSkippedReason: string | null = null
  let emailNotified = false
  let emailId: string | null = null
  let emailSkippedReason: string | null = null

  await Promise.all([
    measure("linearMs", async () => {
      try {
        const { notifyLinearOfCompletedReview } = await import(
          "@/modules/integrations/lib/linear"
        )
        const linearResult = await notifyLinearOfCompletedReview({
          userId,
          owner,
          repo,
          prNumber,
          prTitle: prData.title,
          prUrl,
          prDescription: prData.description || "",
          reviewMarkdown: review,
          reviewId,
        })
        if (linearResult.skipped) {
          linearSkippedReason = linearResult.reason ?? "skipped"
          console.log(
            `[generate-pr-review] linear notify skipped for ${repoId}#${prNumber}: ${linearSkippedReason}`,
          )
        } else {
          linearNotified = true
          linearIssueId = linearResult.issueId ?? null
          console.log(
            `[generate-pr-review] linear notify ok for ${repoId}#${prNumber} issue=${linearIssueId ?? "?"} updated=${Boolean(linearResult.updated)} project=${linearResult.projectId ?? "?"}`,
          )
        }
      } catch (error) {
        console.error(
          `[generate-pr-review] linear notify failed for ${repoId}#${prNumber} (review still saved):`,
          error,
        )
      }
    }),
    measure("emailMs", async () => {
      try {
        const { notifyUserOfCompletedReview } = await import(
          "@/modules/email/pr-review-email"
        )
        const emailResult = await notifyUserOfCompletedReview({
          userId,
          owner,
          repo,
          prNumber,
          prTitle: prData.title,
          prUrl,
          prAuthor: prData.author,
          prDescription: prData.description || "",
          reviewMarkdown: review,
          reviewId,
        })
        if (emailResult.skipped) {
          emailSkippedReason = emailResult.reason
          console.log(
            `[generate-pr-review] email notify skipped for ${repoId}#${prNumber}: ${emailSkippedReason}`,
          )
        } else {
          emailNotified = true
          emailId = emailResult.emailId
          console.log(
            `[generate-pr-review] email notify ok for ${repoId}#${prNumber} id=${emailId ?? "?"}`,
          )
        }
      } catch (error) {
        console.error(
          `[generate-pr-review] email notify failed for ${repoId}#${prNumber} (review still saved):`,
          error,
        )
      }
    }),
  ])

  timings.totalMs = Date.now() - pipelineStartedAt
  console.log(
    `[generate-pr-review] timings ${repoId}#${prNumber} ${JSON.stringify(timings)}`,
  )

  return {
    success: true,
    owner,
    repo,
    prNumber,
    files: prData.changedFiles.length,
    commentPosted,
    inlineCommentsPosted,
    descriptionUpdated,
    review,
    linearNotified,
    linearIssueId,
    linearSkippedReason,
    emailNotified,
    emailId,
    emailSkippedReason,
  }
}

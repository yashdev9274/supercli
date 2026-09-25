import prisma from "@super/db"
import {
  getPullRequestDiff,
  postReviewComment,
  updatePullRequestSummary,
} from "@/modules/github/lib/github"
import { retrieveContext } from "@/modules/pinecone/rag"
import { generateText } from "ai"
import {
  chatModel,
  gatewayProviderChain,
  providerSupportsModel,
  type GatewayProviderName,
} from "@/lib/gateway"

/** Soft caps so huge PRs stay within gateway/model limits. */
const MAX_DIFF_CHARS = 120_000
const MAX_CONTEXT_CHARS = 24_000
const MAX_DESCRIPTION_CHARS = 8_000

/**
 * Routing order (see lib/gateway.ts):
 * Vercel AI Gateway → Merge → direct OPENAI/ANTHROPIC/GOOGLE keys.
 *
 * Prefer free-tier-friendly Vercel models first, then quality models that
 * work on direct keys when gateways are rate-limited.
 *
 * REVIEW_MODEL / AI_GATEWAY_MODEL / MERGE_GATEWAY_MODEL accept comma lists.
 */
const DEFAULT_REVIEW_MODELS = [
  // Vercel free-tier models that currently accept traffic (verified live).
  // Flagship Claude/GPT/Gemini often 403/429 on free credits.
  "openai/gpt-5.4-nano",
  "openai/gpt-oss-120b",
  "google/gemma-4-31b-it",
  "openai/gpt-5.4-mini",
  "google/gemini-2.5-flash",
  "openai/gpt-4.1-mini",
  "openai/gpt-4o-mini",
  // Direct-key quality targets (OPENAI/ANTHROPIC) when gateways are capped
  "anthropic/claude-sonnet-4.5",
  "openai/gpt-4.1",
  // Merge-only last resorts
  "google/gemini-2.5-flash-lite",
  "default_routing",
] as const

function parseModelList(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return raw
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean)
}

function resolveReviewModels(): string[] {
  const fromEnv = [
    ...parseModelList(process.env.REVIEW_MODEL),
    ...parseModelList(process.env.AI_GATEWAY_MODEL),
    ...parseModelList(process.env.MERGE_GATEWAY_MODEL),
  ]
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const model of [...fromEnv, ...DEFAULT_REVIEW_MODELS]) {
    if (seen.has(model)) continue
    seen.add(model)
    ordered.push(model)
  }
  return ordered
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  return "Unknown gateway error"
}

function isQuotaOrPolicyError(error: unknown): boolean {
  const lower = errorMessage(error).toLowerCase()
  return (
    lower.includes("free_tier_model_not_allowed") ||
    lower.includes("free_tier_daily_limit") ||
    lower.includes("free tier") ||
    lower.includes("blocked_by_policy") ||
    lower.includes("model_not_allowed") ||
    lower.includes("restrictedmodelserror") ||
    lower.includes("do not have access to this model") ||
    lower.includes("payment method") ||
    lower.includes("upgrade to paid") ||
    lower.includes("rate_limit") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("gatewayratelimiterror") ||
    lower.includes("quota") ||
    /\b403\b/.test(lower) ||
    /\b429\b/.test(lower)
  )
}

function isNotFoundModelError(error: unknown): boolean {
  const lower = errorMessage(error).toLowerCase()
  return (
    lower.includes("not found") ||
    lower.includes("does not exist") ||
    lower.includes("invalid model") ||
    lower.includes("model_not_found")
  )
}

async function generateReviewText(prompt: string): Promise<string> {
  const models = resolveReviewModels()
  const errors: string[] = []
  let attempt = 0

  // Skip remaining models on a provider once its free-tier daily/global cap is hit.
  const providerExhausted = new Set<GatewayProviderName>()

  for (const modelId of models) {
    const providers = gatewayProviderChain(modelId).filter(
      (p) => !providerExhausted.has(p) && providerSupportsModel(p, modelId),
    )

    for (const provider of providers) {
      attempt += 1
      const label = `${provider}:${modelId}`
      try {
        const result = await generateText({
          model: chatModel(modelId, provider),
          prompt,
          maxOutputTokens: 8192,
          // Don't burn free-tier quotas with SDK internal retries on 429/403.
          maxRetries: 0,
        })
        if (attempt > 1) {
          console.warn(
            `[generate-pr-review] used fallback ${label} after earlier failures`,
          )
        } else {
          console.log(`[generate-pr-review] model ${label}`)
        }
        return result.text
      } catch (error) {
        const message = errorMessage(error)
        errors.push(`${label}: ${message}`)

        if (isQuotaOrPolicyError(error)) {
          // Merge daily 15-req cap / Vercel free-tier rate limit: leave this provider.
          if (
            message.toLowerCase().includes("free_tier_daily_limit") ||
            message.toLowerCase().includes("15 requests per day") ||
            message.toLowerCase().includes("requests per day")
          ) {
            providerExhausted.add(provider)
            console.warn(
              `[generate-pr-review] ${provider} daily/free cap hit; skipping provider`,
            )
          } else {
            console.warn(
              `[generate-pr-review] ${label} policy/rate-limited; trying next:`,
              message,
            )
          }
          continue
        }

        if (isNotFoundModelError(error)) {
          console.warn(
            `[generate-pr-review] ${label} model missing; trying next:`,
            message,
          )
          continue
        }

        console.warn(
          `[generate-pr-review] ${label} failed; trying next:`,
          message,
        )
      }
    }
  }

  console.error("[generate-pr-review] all models/providers failed:", errors)
  throw new Error(
    `AI gateway error: all review models failed (${errors.join(" | ")})`,
  )
}

function truncate(text: string, max: number, label: string) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}

…truncated ${label} (${text.length} → ${max} chars)`
}

export function buildReviewPrompt(input: {
  owner: string
  repo: string
  prNumber: number
  title: string
  description: string
  author: string
  additions: number
  deletions: number
  fileSummary: string
  contextBlocks: string[]
  diff: string
}) {
  const description = truncate(
    input.description || "_No description provided._",
    MAX_DESCRIPTION_CHARS,
    "description",
  )

  let contextBudget = MAX_CONTEXT_CHARS
  const trimmedContext: string[] = []
  for (const block of input.contextBlocks) {
    if (contextBudget <= 0) break
    const slice =
      block.length > contextBudget
        ? `${block.slice(0, contextBudget)}
…truncated context block`
        : block
    trimmedContext.push(slice)
    contextBudget -= slice.length
  }

  const contextSection =
    trimmedContext.length > 0
      ? trimmedContext.map((c, i) => `### Context ${i + 1}\n${c}`).join("\n\n")
      : "_No indexed codebase context available._"

  const diff = truncate(input.diff, MAX_DIFF_CHARS, "diff")

  return `You are Supercode, an expert senior staff engineer writing a pull request review in the style of CodeRabbit / Greptile.

Be specific, actionable, and grounded in the diff. Prefer concrete file/line references over vague advice.
Do not invent APIs or behavior that is not in the diff/context.
If something looks fine, say so briefly — do not pad.

## Pull request
- Repo: ${input.owner}/${input.repo}
- PR: #${input.prNumber}
- Author: @${input.author}
- Title: ${input.title}
- Stats: +${input.additions} / -${input.deletions}

### Description
${description}

### Changed files
${input.fileSummary}

## Relevant codebase context
${contextSection}

## Diff
\`\`\`diff
${diff}
\`\`\`

## Output format (Markdown only)

### Summary
2–4 sentences on what this PR does and why it matters.

### PR description summary
A concise changelog for the PR description. Group bullets under only the relevant plain-text category headings, such as \`New Features\`, \`Bug Fixes\`, \`Documentation\`, \`Tests\`, \`Refactoring\`, or \`Infrastructure\`. Put each heading on its own line, followed by short Markdown bullets. Do not use \`#\` heading markers in this section. Omit empty categories.

### Walkthrough
Bullet list of the main changes by area/file. Keep it scannable.

### Changes table
A markdown table:

| File | Summary |
|------|---------|
| path | one-line what changed |

### Findings
Prioritized review findings. Use this exact format for each finding:

- **[severity] short title** — \`path/to/file\`
  Explanation and why it matters.
  Suggested fix (code fence if helpful).

Severity levels: \`critical\`, \`high\`, \`medium\`, \`low\`, \`nit\`.
If there are no issues, write: \`No blocking issues found.\`

### Risk assessment
One of: **Low** / **Medium** / **High** — with a one-line justification (blast radius, auth, data, migrations, etc.).

### Test plan
Checklist of concrete verification steps:
- [ ] ...

### Suggested PR description
A cleaned-up PR body the author could paste, with:
- What
- Why
- How tested

Do not include a poem. Do not wrap the whole response in a single code fence.`
}

function extractPrDescriptionSummary(review: string): string | null {
  const match = review.match(
    /(?:^|\n)###\s+PR description summary\s*\n([\s\S]*?)(?=\n###\s|$)/i,
  )
  const summary = match?.[1]?.trim()
  return summary || null
}

export type GeneratePrReviewInput = {
  owner: string
  repo: string
  prNumber: number
  userId: string
}

export type GeneratePrReviewResult = {
  success: true
  owner: string
  repo: string
  prNumber: number
  files: number
  commentPosted: boolean
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

  await measure("pendingMs", () => markReviewPending(resolvedInput))

  const prData = await measure("githubFetchMs", () =>
    getPullRequestDiff(accessToken, owner, repo, prNumber),
  )

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
    console.error("[generate-pr-review] retrieveContext failed:", error)
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
  })

  const text = await measure("generationMs", () => generateReviewText(prompt))

  if (!text?.trim()) {
    throw new Error("Model returned empty review")
  }

  const review = text
  const prUrl = `https://github.com/${owner}/${repo}/pull/${prNumber}`

  let reviewId: string | null = null
  await measure("persistenceMs", async () => {
    const repository = await findRepository(owner, repo, userId)
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

  // Persist completed review first so the dashboard is correct even if GitHub
  // writes fail. The sticky comment and PR-body summary are independent and
  // best-effort, so run them concurrently without failing the review.
  let commentPosted = false
  let descriptionUpdated = false
  const descriptionSummary = extractPrDescriptionSummary(review)

  await Promise.all([
    measure("githubCommentMs", async () => {
      try {
        await postReviewComment(accessToken, owner, repo, prNumber, review, {
          headSha: prData.headSha,
          event: "COMMENT",
        })
        commentPosted = true
      } catch (error) {
        console.error(
          `[generate-pr-review] postReviewComment failed for ${repoId}#${prNumber} (review still saved):`,
          error,
        )
      }
    }),
    measure("githubDescriptionMs", async () => {
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

import prisma from "@super/db"
import { getPullRequestDiff, postReviewComment } from "@/modules/github/lib/github"
import { retrieveContext } from "@/modules/pinecone/rag"
import { generateText } from "ai"
import { gateway } from "@/lib/gateway"

/** Soft caps so huge PRs stay within gateway/model limits. */
const MAX_DIFF_CHARS = 120_000
const MAX_CONTEXT_CHARS = 24_000
const MAX_DESCRIPTION_CHARS = 8_000

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
  review: string
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

  // Resolve token first so we can bind the review to a real connected user
  // even when the Inngest payload carries a bad/stale userId.
  const { accessToken, userId } = await resolveGithubAccessToken(input)
  const resolvedInput = { ...input, userId }

  await markReviewPending(resolvedInput)

  const prData = await getPullRequestDiff(
    accessToken,
    owner,
    repo,
    prNumber,
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

    context = await retrieveContext(query, repoId, 6)
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

  let text: string
  try {
    const result = await generateText({
      // Use chat completions path via Merge AI SDK shim (see lib/gateway.ts).
      // Default gateway(modelId) hits /responses with OpenAI Responses shape;
      // chat() is more portable across gateways.
      model: gateway.chat("anthropic/claude-sonnet-4-6"),
      prompt,
      maxOutputTokens: 8192,
    })
    text = result.text
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown gateway error"
    console.error("[generate-pr-review] generateText failed:", error)
    throw new Error(`AI gateway error: ${message}`)
  }

  if (!text?.trim()) {
    throw new Error("Model returned empty review")
  }

  const review = text

  const repository = await findRepository(owner, repo, userId)
  if (!repository) {
    console.warn(`[generate-pr-review] repository ${repoId} missing when saving`)
  } else {
    await prisma.review.upsert({
      where: {
        repositoryId_prNumber: {
          repositoryId: repository.id,
          prNumber,
        },
      },
      update: {
        prTitle: prData.title,
        prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        review,
        status: "completed",
      },
      create: {
        repositoryId: repository.id,
        prNumber,
        prTitle: prData.title,
        prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        review,
        status: "completed",
      },
    })
  }

  // Persist completed review first so the dashboard is correct even if GitHub
  // commenting fails. Sticky PR comment is best-effort after that — do not
  // fail the whole job (Inngest onFailure would flip status back to failed).
  let commentPosted = false
  try {
    await postReviewComment(
      accessToken,
      owner,
      repo,
      prNumber,
      review,
      { headSha: prData.headSha, event: "COMMENT" },
    )
    commentPosted = true
  } catch (error) {
    console.error(
      `[generate-pr-review] postReviewComment failed for ${repoId}#${prNumber} (review still saved):`,
      error,
    )
  }

  return {
    success: true,
    owner,
    repo,
    prNumber,
    files: prData.changedFiles.length,
    commentPosted,
    review,
  }
}

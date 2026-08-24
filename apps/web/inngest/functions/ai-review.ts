import prisma from "@super/db"
import { inngest } from "../client"
import { getPullRequestDiff, postReviewComment } from "@/modules/github/lib/github"
import { retrieveContext } from "@/modules/pinecone/rag"
import { generateText } from "ai"
import { gateway } from "@/lib/gateway"

function buildReviewPrompt(input: {
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
  const contextSection =
    input.contextBlocks.length > 0
      ? input.contextBlocks.map((c, i) => `### Context ${i + 1}\n${c}`).join("\n\n")
      : "_No indexed codebase context available._"

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
${input.description || "_No description provided._"}

### Changed files
${input.fileSummary}

## Relevant codebase context
${contextSection}

## Diff
\`\`\`diff
${input.diff}
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

export const generateReview = inngest.createFunction(
  {
    id: "generate-review",
    concurrency: 5,
    retries: 2,
  },
  { event: "pr.review.requested" },

  async ({ event, step }) => {
    const { owner, repo, prNumber, userId } = event.data as {
      owner: string
      repo: string
      prNumber: number
      userId: string
    }

    const repoId = `${owner}/${repo}`

    // Mark pending early so dashboard/logs can show in-progress reviews
    await step.run("mark-pending", async () => {
      const repository = await prisma.repository.findFirst({
        where: { owner, name: repo },
      })
      if (!repository) return null

      await prisma.review.upsert({
        where: {
          repositoryId_prNumber: {
            repositoryId: repository.id,
            prNumber,
          },
        },
        update: {
          status: "pending",
        },
        create: {
          repositoryId: repository.id,
          prNumber,
          prTitle: "Review in progress…",
          prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
          review: "Review queued.",
          status: "pending",
        },
      })
      return repository.id
    })

    const prData = await step.run("fetch-pr-data", async () => {
      const account = await prisma.account.findFirst({
        where: {
          userId,
          providerId: "github",
        },
      })

      if (!account?.accessToken) {
        throw new Error("No github access token found")
      }

      const data = await getPullRequestDiff(
        account.accessToken,
        owner,
        repo,
        prNumber,
      )

      return {
        ...data,
        token: account.accessToken,
      }
    })

    const context = await step.run("retrieve-context", async () => {
      try {
        const query = [
          prData.title,
          prData.description,
          ...prData.changedFiles.map((f) => f.filename),
        ]
          .filter(Boolean)
          .join("\n")

        return await retrieveContext(query, repoId, 6)
      } catch (error) {
        console.error("[generate-review] retrieveContext failed:", error)
        return [] as string[]
      }
    })

    const review = await step.run("generate-ai-review", async () => {
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

      const { text } = await generateText({
        model: gateway("anthropic/claude-sonnet-4-20250514"),
        prompt,
        maxOutputTokens: 8192,
      })

      if (!text?.trim()) {
        throw new Error("Model returned empty review")
      }

      return text
    })

    await step.run("post-comment", async () => {
      await postReviewComment(
        prData.token,
        owner,
        repo,
        prNumber,
        review,
        { headSha: prData.headSha, event: "COMMENT" },
      )
    })

    await step.run("save-review", async () => {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
        },
      })

      if (!repository) {
        console.warn(`[generate-review] repository ${repoId} missing when saving`)
        return
      }

      await prisma.review.upsert({
        where: {
          repositoryId_prNumber: {
            repositoryId: repository.id,
            prNumber,
          },
        },
        update: {
          prTitle: prData.title,
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
    })

    return {
      success: true,
      owner,
      repo,
      prNumber,
      files: prData.changedFiles.length,
    }
  },
)

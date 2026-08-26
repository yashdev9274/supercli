import { inngest } from "../client"
import {
  markReviewFailed,
  runGeneratePrReview,
} from "@/modules/ai/lib/generate-pr-review"

/**
 * Background AI PR review worker.
 * Triggered by `pr.review.requested` from GitHub webhooks, dashboard, or
 * repo-connect backfill. Posts a sticky GitHub PR comment when done.
 */
export const generateReview = inngest.createFunction(
  {
    id: "generate-review",
    // One in-flight review per PR; burst pushes collapse via debounce below.
    concurrency: [
      {
        limit: 1,
        key: "event.data.owner + '/' + event.data.repo + '#' + event.data.prNumber",
      },
      { limit: 5 },
    ],
    // Rapid synchronize events → one review on the latest head.
    debounce: {
      key: "event.data.owner + '/' + event.data.repo + '#' + event.data.prNumber",
      period: "30s",
    },
    retries: 2,
    onFailure: async ({ event, error }) => {
      const data = event.data.event.data as {
        owner?: string
        repo?: string
        prNumber?: number
        userId?: string
      }
      const owner = data.owner
      const repo = data.repo
      const prNumber = data.prNumber
      const userId = data.userId
      if (!owner || !repo || !prNumber || !userId) return

      try {
        await markReviewFailed(
          { owner, repo, prNumber, userId },
          error.message || "Review generation failed",
        )
      } catch (dbError) {
        console.error("[generate-review] onFailure failed to persist:", dbError)
      }
    },
  },
  { event: "pr.review.requested" },

  async ({ event, step }) => {
    const { owner, repo, prNumber, userId, source } = event.data as {
      owner: string
      repo: string
      prNumber: number
      userId?: string
      source?: string
    }

    // Drop diagnostic / malformed events (e.g. manual probe sends).
    if (
      !owner ||
      !repo ||
      !prNumber ||
      source === "probe" ||
      userId === "probe"
    ) {
      console.warn(
        `[generate-review] skipping invalid event owner=${owner} repo=${repo} pr=${prNumber} userId=${userId} source=${source}`,
      )
      return { skipped: true, reason: "invalid_event" }
    }

    console.log(
      `[generate-review] start ${owner}/${repo}#${prNumber} source=${source ?? "unknown"} userId=${userId ?? "(resolve)"}`,
    )

    // Single step so retries re-run the full pipeline cleanly.
    // Core logic lives in runGeneratePrReview (also used for local/in-process fallback).
    // That pipeline resolves the GitHub token from the connected repo owner.
    return await step.run("generate-and-save-review", async () => {
      const result = await runGeneratePrReview({
        owner,
        repo,
        prNumber,
        // May be undefined/stale — runGeneratePrReview resolves via repository.userId
        userId: userId ?? "",
      })

      console.log(
        `[generate-review] done ${owner}/${repo}#${prNumber} files=${result.files} commentPosted=${result.commentPosted}`,
      )

      return {
        success: result.success,
        owner: result.owner,
        repo: result.repo,
        prNumber: result.prNumber,
        files: result.files,
        commentPosted: result.commentPosted,
      }
    })
  },
)

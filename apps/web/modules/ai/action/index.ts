import { after } from "next/server"
import { inngest } from "@/inngest/client"
import prisma from "@super/db"
import {
  markReviewFailed,
  runGeneratePrReview,
} from "@/modules/ai/lib/generate-pr-review"

/**
 * Only queue via Inngest when a worker will actually pick the event up.
 *
 * Pitfall we hit: setting INNGEST_EVENT_KEY locally makes `inngest.send`
 * succeed against Inngest Cloud, but nothing runs the job unless the cloud
 * app is synced to a public serve URL. Reviews stay `pending` forever.
 *
 * Safe cases:
 * - INNGEST_DEV=1 → local `inngest-cli dev` processes events
 * - Vercel/production with event key → cloud invokes /api/inngest
 */
function shouldQueueViaInngest() {
  if (process.env.INNGEST_DEV === "1" || process.env.INNGEST_DEV === "true") {
    return true
  }

  const hasEventKey = Boolean(process.env.INNGEST_EVENT_KEY)
  if (!hasEventKey) return false

  // Cloud worker path — only when we are actually on a deployed runtime.
  if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") {
    return true
  }

  // Local next dev + cloud keys only → would orphan events. Use after().
  console.warn(
    "[reviewPullRequest] INNGEST_EVENT_KEY is set but this is not production and INNGEST_DEV is not 1 — using in-process after() so reviews actually run. For local Inngest: run `npx inngest-cli@latest dev` and set INNGEST_DEV=1.",
  )
  return false
}

export async function reviewPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
  options?: {
    userId?: string
    prTitle?: string
    /** Origin for logs / Inngest payload (webhook, dashboard, backfill, …). */
    source?: string
    /** GitHub delivery id when sourced from a webhook. */
    deliveryId?: string
    /**
     * When true, wait for the full in-process review before returning.
     * Default: queue async (Inngest if configured, otherwise next/server after()).
     */
    wait?: boolean
  },
) {
  try {
    const repository =
      (options?.userId
        ? await prisma.repository.findFirst({
            where: { owner, name: repo, userId: options.userId },
            include: {
              user: {
                include: {
                  accounts: {
                    where: { providerId: "github" },
                  },
                },
              },
            },
          })
        : null) ??
      (await prisma.repository.findFirst({
        where: { owner, name: repo },
        include: {
          user: {
            include: {
              accounts: {
                where: { providerId: "github" },
              },
            },
          },
        },
      }))

    if (!repository) {
      throw new Error(
        `Repository ${owner}/${repo} not found in database. Reconnect the repository in Supercode.`,
      )
    }

    const githubAccount = repository.user.accounts[0]

    if (!githubAccount?.accessToken) {
      throw new Error(
        "No GitHub access token found for the repository owner. Re-authenticate with GitHub.",
      )
    }

    // Mark pending before queueing so failures after send are still visible
    await prisma.review.upsert({
      where: {
        repositoryId_prNumber: {
          repositoryId: repository.id,
          prNumber,
        },
      },
      update: {
        status: "pending",
        prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        ...(options?.prTitle ? { prTitle: options.prTitle } : {}),
      },
      create: {
        repositoryId: repository.id,
        prNumber,
        prTitle: options?.prTitle ?? "Review queued…",
        prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        review: "Waiting for AI review worker…",
        status: "pending",
      },
    })

    const payload = {
      owner,
      repo,
      prNumber,
      userId: repository.user.id,
      source: options?.source ?? "manual",
      deliveryId: options?.deliveryId,
    }

    const runInProcess = async () => {
      try {
        await runGeneratePrReview(payload)
        console.log(
          `[reviewPullRequest] completed in-process review for ${owner}/${repo}#${prNumber}`,
        )
      } catch (error) {
        console.error(
          `[reviewPullRequest] in-process review failed for ${owner}/${repo}#${prNumber}:`,
          error,
        )
        await markReviewFailed(
          payload,
          error instanceof Error ? error.message : "Unknown Error",
        )
      }
    }

    // Dashboard / manual: always run in-process via after().
    // Inngest cloud can accept events while no worker runs them (mis-synced app,
    // missing serve URL, debounce stall) — that left reviews as pending forever
    // with "Waiting for AI review worker…". Webhooks still prefer Inngest.
    const preferInProcess =
      options?.wait === true ||
      payload.source === "dashboard" ||
      payload.source === "manual"

    if (options?.wait) {
      await runGeneratePrReview(payload)
      console.log(
        `[reviewPullRequest] completed blocking in-process review for ${owner}/${repo}#${prNumber}`,
      )
      return {
        success: true,
        message: "Review completed",
        mode: "blocking" as const,
      }
    }

    // Prefer Inngest only for background sources (webhook/backfill) when a worker
    // will actually process the event.
    if (!preferInProcess && shouldQueueViaInngest()) {
      try {
        await inngest.send({
          name: "pr.review.requested",
          data: payload,
          // Collapse duplicate deliveries for the same PR head burst.
          id: options?.deliveryId
            ? `pr-review-${owner}-${repo}-${prNumber}-${options.deliveryId}`
            : undefined,
        })

        console.log(
          `[reviewPullRequest] queued pr.review.requested for ${owner}/${repo}#${prNumber} user=${repository.user.id} source=${payload.source}`,
        )

        return {
          success: true,
          message: "Review queued",
          mode: "inngest" as const,
        }
      } catch (error) {
        console.warn(
          `[reviewPullRequest] inngest.send failed, falling back to in-process for ${owner}/${repo}#${prNumber}:`,
          error,
        )
      }
    }

    // Finish after the response so the dashboard can poll status → completed/failed.
    after(() => {
      void runInProcess()
    })

    console.log(
      `[reviewPullRequest] scheduled in-process review via after() for ${owner}/${repo}#${prNumber} source=${payload.source}`,
    )

    return {
      success: true,
      message: "Review queued",
      mode: "after" as const,
    }
  } catch (error) {
    console.error(
      `[reviewPullRequest] failed for ${owner}/${repo}#${prNumber}:`,
      error,
    )

    try {
      const repository = await prisma.repository.findFirst({
        where: {
          owner,
          name: repo,
          ...(options?.userId ? { userId: options.userId } : {}),
        },
      })

      if (repository) {
        await markReviewFailed(
          {
            owner,
            repo,
            prNumber,
            userId: repository.userId,
          },
          error instanceof Error ? error.message : "Unknown Error",
        )
      }
    } catch (dbError) {
      console.error("[reviewPullRequest] failed to save error:", dbError)
    }

    // Re-throw so webhook logs show the real failure
    throw error
  }
}

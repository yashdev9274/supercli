import { createHash } from "node:crypto"

import { PublicReviewError } from "./public-review-errors"
import {
  assertPublicSnapshotCurrent,
  createPublicGithubClient,
  fetchPublicPrSnapshot,
  PUBLIC_REVIEW_LIMITS,
  type PublicPrSnapshot,
  type PublicReviewPayload,
} from "./public-review-github"
import { parsePublicPrUrl } from "./public-pr-url"
import type { CachedPublicReview, PublicReviewStore } from "./public-review-store"

export function publicReviewCacheIdentity(snapshot: PublicPrSnapshot): { key: string; inputHash: string } {
  return {
    key: `${snapshot.identity.owner}/${snapshot.identity.repo}#${snapshot.identity.prNumber}@${snapshot.payload.headSha}`,
    inputHash: createHash("sha256").update(JSON.stringify([
      "public-review-v1",
      snapshot.baseSha,
      snapshot.payload.review.prTitle,
      snapshot.payload.review.body,
      snapshot.fileSummary,
      snapshot.diff,
    ])).digest("hex"),
  }
}

function completedPayload(snapshot: PublicPrSnapshot, cached: CachedPublicReview): PublicReviewPayload {
  return {
    ...snapshot.payload,
    review: { ...snapshot.payload.review, status: "completed", review: cached.markdown, updatedAt: cached.updatedAt.toISOString() },
  }
}

export function createPublicReviewService(dependencies: {
  store: PublicReviewStore
  fetcher?: typeof fetch
  generate?: (snapshot: PublicPrSnapshot, signal: AbortSignal) => Promise<string>
}) {
  return async (input: { url: string; subject: string; generate: boolean; signal: AbortSignal }): Promise<PublicReviewPayload> => {
    let identity
    try {
      identity = parsePublicPrUrl(input.url)
    } catch (error) {
      throw new PublicReviewError(error instanceof Error ? error.message : "Enter a valid public GitHub pull request URL.", 400)
    }
    input.signal.throwIfAborted()
    await dependencies.store.reserveFetch(input.subject)
    const github = createPublicGithubClient(input.signal, dependencies.fetcher)
    const snapshot = await fetchPublicPrSnapshot(identity, github)
    const { key, inputHash } = publicReviewCacheIdentity(snapshot)
    if (!input.generate) {
      const cached = await dependencies.store.read(key, inputHash)
      return cached ? completedPayload(snapshot, cached) : snapshot.payload
    }
    input.signal.throwIfAborted()
    const reservation = await dependencies.store.reserveGeneration(key, inputHash, input.subject)
    if (reservation.cached) return completedPayload(snapshot, reservation.cached)
    const leaseToken = reservation.leaseToken
    try {
      const generate = dependencies.generate ?? (await import("./public-review-generation")).generatePublicReview
      const markdown = await generate(snapshot, input.signal)
      input.signal.throwIfAborted()
      if (!markdown.trim()) throw new PublicReviewError("The review provider returned an empty review. Please try again later.", 503)
      if (markdown.length > PUBLIC_REVIEW_LIMITS.markdownChars) throw new PublicReviewError("The generated review was too large. Please try a smaller PR.", 422)
      await assertPublicSnapshotCurrent(snapshot, github)
      input.signal.throwIfAborted()
      const cached = await dependencies.store.complete(key, leaseToken, markdown)
      return completedPayload(snapshot, cached)
    } catch (error) {
      try {
        await dependencies.store.fail(key, leaseToken)
      } catch {
        throw new PublicReviewError("Public review storage is unavailable. Please try again later.", 503)
      }
      if (input.signal.aborted) throw new PublicReviewError("The review timed out. Please try again later.", 504)
      throw error
    }
  }
}

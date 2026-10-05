import { createHash } from "node:crypto"

import { parsePublicPrUrl } from "./public-pr-url"
import { PublicReviewError } from "./public-review-errors"
import { fetchPublicPrSnapshot } from "./public-review-github"
import { createPublicReviewPublisher, PublicReviewGithubConnectRequired } from "./public-review-publish-github"
import { readPublicReviewPublishBody } from "./public-review-publish-request"
import type { PublicReviewPublishStore } from "./public-review-publish-store"
import { assertPublicReviewSameOrigin } from "./public-review-request"
import { publicReviewCacheIdentity } from "./public-review-service"
import type { PublicReviewStore } from "./public-review-store"

export function createPublicReviewPublishHandler(dependencies: {
  getSession: (headers: Headers) => Promise<{ user: { id: string } } | null>
  getToken: (userId: string) => Promise<string>
  cache: Pick<PublicReviewStore, "read">
  store: PublicReviewPublishStore
  fetcher?: typeof fetch
}) {
  return async (request: Request): Promise<Response> => {
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(90_000)])
    try {
      const session = await dependencies.getSession(request.headers)
      if (!session?.user.id) throw new PublicReviewGithubConnectRequired()
      assertPublicReviewSameOrigin(request)
      const input = await readPublicReviewPublishBody(request)
      let identity
      try {
        identity = parsePublicPrUrl(input.url)
      } catch {
        throw new PublicReviewError("Enter a valid public GitHub pull request URL.", 400)
      }
      let token: string
      try {
        token = await dependencies.getToken(session.user.id)
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "GITHUB_REAUTH_REQUIRED") throw new PublicReviewGithubConnectRequired()
        throw error
      }
      if (!token) throw new PublicReviewGithubConnectRequired()
      signal.throwIfAborted()
      const lease = await dependencies.store.begin(session.user.id, identity.url)
      try {
        const publisher = createPublicReviewPublisher(token, signal, dependencies.fetcher)
        const github = publisher.readSnapshot
        const snapshot = await fetchPublicPrSnapshot(identity, github)
        if (snapshot.payload.headSha !== input.headSha) throw new PublicReviewError("This PR has changed. Load and generate its latest review before adding it.", 409)
        const { key, inputHash } = publicReviewCacheIdentity(snapshot)
        const cached = await dependencies.cache.read(key, inputHash)
        if (!cached?.markdown.trim() || createHash("sha256").update(cached.markdown.trim()).digest("hex") !== input.reviewHash) {
          throw new PublicReviewError("The displayed review is no longer cached for this PR. Load and generate its latest review before adding it.", 409)
        }
        const prepared = await publisher.prepare(identity, { ...input, markdown: cached.markdown })
        if (!prepared.alreadyPosted) await dependencies.store.reserveWrite(session.user.id, lease)
        const current = await fetchPublicPrSnapshot(identity, github)
        const currentIdentity = publicReviewCacheIdentity(current)
        if (currentIdentity.key !== key || currentIdentity.inputHash !== inputHash) throw new PublicReviewError("This PR changed while the review was being added. Load its latest review and try again.", 409)
        await dependencies.store.assertLease(lease)
        signal.throwIfAborted()
        const commentUrl = prepared.alreadyPosted && prepared.commentUrl ? prepared.commentUrl : await prepared.write()
        return Response.json({ commentUrl, ...(prepared.alreadyPosted && { alreadyPosted: true }) }, { headers: { "Cache-Control": "no-store" } })
      } finally {
        await dependencies.store.release(lease)
      }
    } catch (error) {
      const known = error instanceof PublicReviewError
      return Response.json({
        error: known ? error.message : "Review publishing is temporarily unavailable. Check the PR before trying again.",
        ...(error instanceof PublicReviewGithubConnectRequired && { code: "GITHUB_CONNECT_REQUIRED", redirectUrl: "/dashboard" }),
      }, {
        status: known ? error.status : signal.aborted ? 504 : 503,
        headers: { "Cache-Control": "no-store", ...(known && error.retryAfter && { "Retry-After": String(error.retryAfter) }) },
      })
    }
  }
}

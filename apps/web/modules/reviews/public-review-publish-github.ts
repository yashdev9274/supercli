import { z } from "zod"

import type { PublicPrIdentity } from "./public-pr-url"
import { PublicReviewError } from "./public-review-errors"
import { PUBLIC_REVIEW_LIMITS } from "./public-review-github"

export class PublicReviewGithubConnectRequired extends PublicReviewError {
  constructor() {
    super("Connect GitHub from your dashboard to add this review.", 401)
  }
}

export const PUBLIC_REVIEW_COMMENT_MARKER = "supercode-public-review:v1"
const userSchema = z.object({ id: z.number().int().positive().safe(), type: z.literal("User") })
const commentSchema = z.object({
  id: z.number().int().positive().safe(),
  body: z.string().nullable(),
  user: z.object({ id: z.number().int().positive().safe(), type: z.string() }).nullable(),
})
const markerPattern = /^<!-- supercode-public-review:v1 user=(\d+) head=([a-f\d]{40}) review=([a-f\d]{64}) -->\n/

export function publicReviewCommentBody(input: {
  identity: PublicPrIdentity
  userId: number
  headSha: string
  reviewHash: string
  markdown: string
}): string {
  const body = `<!-- ${PUBLIC_REVIEW_COMMENT_MARKER} user=${input.userId} head=${input.headSha} review=${input.reviewHash} -->\n## Supercode review\n\n${input.markdown.trim()}\n\n---\nReviewed commit: [\`${input.headSha.slice(0, 7)}\`](https://github.com/${input.identity.owner}/${input.identity.repo}/commit/${input.headSha}) · Generated with [Supercode](https://supercli.com)\n`
  if (Buffer.byteLength(body, "utf8") > 65_536) throw new PublicReviewError("The complete review is too large for a GitHub comment.", 422)
  return body
}

export function createPublicReviewPublisher(token: string, signal: AbortSignal, fetcher: typeof fetch = fetch) {
  let totalBytes = 0
  let snapshotBytes = 0
  const github = async (path: string, method = "GET", body?: string, snapshot = false): Promise<{ data: unknown; next: boolean }> => {
    signal.throwIfAborted()
    let response: Response
    try {
      response = await fetcher(`https://api.github.com${path}`, {
        method,
        headers: {
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          Authorization: `Bearer ${token}`,
          ...(body !== undefined && { "Content-Type": "application/json" }),
        },
        ...(body !== undefined && { body: JSON.stringify({ body }) }),
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      })
    } catch {
      throw new PublicReviewError("GitHub could not be reached. Check the PR before trying again.", 503)
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      if (response.status === 401) throw new PublicReviewGithubConnectRequired()
      if (response.status === 429 || (response.status === 403 && (response.headers.get("x-ratelimit-remaining") === "0" || response.headers.has("retry-after")))) {
        throw new PublicReviewError("GitHub's publishing limit has been reached. Please try again later.", 429, 60)
      }
      if (response.status === 403 || response.status === 404) throw new PublicReviewError("Your GitHub account cannot comment on this pull request.", 403)
      throw new PublicReviewError("GitHub could not add this review. Check the PR before trying again.", 502)
    }
    const reader = response.body?.getReader()
    if (!reader) throw new PublicReviewError("GitHub returned an empty response.", 502)
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      if (Number(response.headers.get("content-length") ?? 0) > 1_000_000) throw new PublicReviewError("GitHub's comment response is too large to search safely.", 422)
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        bytes += value.byteLength
        totalBytes += value.byteLength
        if (snapshot) {
          snapshotBytes += value.byteLength
          if (snapshotBytes > PUBLIC_REVIEW_LIMITS.totalResponseBytes) throw new PublicReviewError("GitHub's public PR response is too large to validate safely.", 422)
        }
        if (bytes > 1_000_000 || totalBytes > 6_000_000) throw new PublicReviewError("GitHub's comment response is too large to search safely.", 422)
        chunks.push(value)
      }
      const data = new Uint8Array(bytes)
      let offset = 0
      for (const chunk of chunks) {
        data.set(chunk, offset)
        offset += chunk.length
      }
      return { data: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data)), next: Boolean(response.headers.get("link")?.includes('rel="next"')) }
    } catch (error) {
      void reader.cancel().catch(() => {})
      if (error instanceof PublicReviewError) throw error
      throw new PublicReviewError("GitHub returned an incomplete response. Check the PR before trying again.", 502)
    } finally {
      reader.releaseLock()
    }
  }

  return {
    readSnapshot: async (path: string): Promise<unknown> => {
      const response = await github(path, "GET", undefined, true)
      if (response.next) throw new PublicReviewError("This public PR is too large to validate completely.", 422)
      return response.data
    },
    prepare: async (identity: PublicPrIdentity, input: { headSha: string; reviewHash: string; markdown: string }) => {
      const user = userSchema.safeParse((await github("/user")).data)
      if (!user.success) throw new PublicReviewError("GitHub could not verify your account.", 403)
      const body = publicReviewCommentBody({ ...input, identity, userId: user.data.id })
      const path = `/repos/${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.repo)}`
      let existing: z.infer<typeof commentSchema> | undefined
      for (let page = 1; page <= 5; page += 1) {
        const response = await github(`${path}/issues/${identity.prNumber}/comments?per_page=100&page=${page}`)
        const comments = z.array(commentSchema).max(100).safeParse(response.data)
        if (!comments.success) throw new PublicReviewError("GitHub returned incomplete comments. No review was posted.", 502)
        for (const comment of comments.data) {
          const marker = comment.body?.match(markerPattern)
          if (comment.user?.id !== user.data.id || comment.user.type !== "User" || marker?.[1] !== String(user.data.id)) continue
          if (!existing || comment.body === body) existing = comment
        }
        if (!response.next) {
          return {
            alreadyPosted: existing?.body === body,
            commentUrl: existing ? `${identity.url}#issuecomment-${existing.id}` : undefined,
            write: async (): Promise<string> => {
              const response = existing
                ? await github(`${path}/issues/comments/${existing.id}`, "PATCH", body)
                : await github(`${path}/issues/${identity.prNumber}/comments`, "POST", body)
              const comment = commentSchema.safeParse(response.data)
              if (!comment.success || comment.data.user?.id !== user.data.id || comment.data.user.type !== "User" || comment.data.body !== body || (existing && comment.data.id !== existing.id)) {
                throw new PublicReviewError("GitHub could not confirm the comment. Check the PR before trying again.", 502)
              }
              return `${identity.url}#issuecomment-${comment.data.id}`
            },
          }
        }
      }
      throw new PublicReviewError("This PR has too many comments to search completely. No review was posted.", 422)
    },
  }
}

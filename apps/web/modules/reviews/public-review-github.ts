import { z } from "zod"

import type { PrDiffFile, ReviewDetail } from "@/modules/dashboard/actions"
import { PublicReviewError } from "./public-review-errors"
import type { PublicPrIdentity } from "./public-pr-url"

export const PUBLIC_REVIEW_LIMITS = {
  files: 50,
  changedLines: 2500,
  diffChars: 120_000,
  descriptionChars: 8000,
  promptChars: 150_000,
  responseBytes: 1_000_000,
  totalResponseBytes: 2_000_000,
  markdownChars: 100_000,
  treeEntries: 10_000,
} as const

export type PublicReviewPayload = {
  review: Omit<ReviewDetail, "createdAt" | "updatedAt"> & {
    createdAt: string
    updatedAt: string
  }
  files: PrDiffFile[]
  headSha: string
}

export type PublicPrSnapshot = {
  payload: PublicReviewPayload
  identity: PublicPrIdentity
  baseSha: string
  diff: string
  fileSummary: string
}

const sha = z.string().regex(/^[a-f\d]{40}$/i)
const count = z.number().int().nonnegative().safe()
const repositorySchema = z.object({
  id: z.number().int().positive().safe(),
  full_name: z.string(),
  private: z.boolean(),
})
const prSchema = z.object({
  number: z.number().int().positive(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.enum(["open", "closed"]),
  merged_at: z.string().nullable(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  additions: count,
  deletions: count,
  changed_files: count,
  user: z.object({ login: z.string(), id: z.number().int().positive().safe() }).nullable(),
  base: z.object({ sha, ref: z.string(), repo: repositorySchema }),
  head: z.object({ sha, ref: z.string() }),
})
const filesSchema = z.array(z.object({
  sha,
  filename: z.string().min(1).max(1024),
  previous_filename: z.string().min(1).max(1024).optional(),
  status: z.enum(["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"]),
  additions: count,
  deletions: count,
  changes: count,
  patch: z.string().optional(),
}))

function tooLarge(): never {
  throw new PublicReviewError("This pull request is too large for a free review. Use a PR with at most 50 files, 2,500 changed lines, and 120,000 diff characters.", 422)
}

function incompleteDiff(): never {
  throw new PublicReviewError("GitHub did not provide a complete text diff. Binary files and truncated patches cannot be reviewed for free.", 422)
}

export function assertCompletePublicPatch(file: PrDiffFile): void {
  if (!file.patch) {
    if (file.additions || file.deletions || file.changes || !["renamed", "copied", "unchanged"].includes(file.status)) incompleteDiff()
    return
  }
  let oldRemaining = 0
  let newRemaining = 0
  let additions = 0
  let deletions = 0
  let hunks = 0
  const lines = file.patch.split("\n")
  if (lines.at(-1) === "") lines.pop()
  for (const line of lines) {
    const hunk = line.match(/^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@(?:.*)$/)
    if (hunk) {
      if (oldRemaining || newRemaining) incompleteDiff()
      oldRemaining = hunk[1] === undefined ? 1 : Number(hunk[1])
      newRemaining = hunk[2] === undefined ? 1 : Number(hunk[2])
      hunks += 1
      continue
    }
    if (line === "\\ No newline at end of file") continue
    if (!hunks) incompleteDiff()
    if (line.startsWith("+")) {
      newRemaining -= 1
      additions += 1
    } else if (line.startsWith("-")) {
      oldRemaining -= 1
      deletions += 1
    } else if (line.startsWith(" ")) {
      oldRemaining -= 1
      newRemaining -= 1
    } else {
      incompleteDiff()
    }
    if (oldRemaining < 0 || newRemaining < 0) incompleteDiff()
  }
  if (!hunks || oldRemaining || newRemaining || additions !== file.additions || deletions !== file.deletions) incompleteDiff()
}

export function createPublicGithubClient(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
) {
  let totalBytes = 0
  return async (path: string): Promise<unknown> => {
    let response: Response
    try {
      response = await fetcher(`https://api.github.com${path}`, {
        headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
        redirect: "error",
        cache: "no-store",
        signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
      })
    } catch {
      throw new PublicReviewError("GitHub could not be reached. Please try again shortly.", 503)
    }
    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 404) throw new PublicReviewError("Public pull request not found. Private repositories are not supported.", 404)
      if (response.status === 403 || response.status === 429) throw new PublicReviewError("GitHub's public request limit has been reached. Please try again later.", 429, 3600)
      throw new PublicReviewError("GitHub could not load this pull request. Please try again shortly.", 502)
    }
    if (response.headers.get("link")?.includes('rel="next"')) {
      await response.body?.cancel()
      tooLarge()
    }
    if (Number(response.headers.get("content-length") ?? 0) > PUBLIC_REVIEW_LIMITS.responseBytes) {
      await response.body?.cancel()
      tooLarge()
    }
    const reader = response.body?.getReader()
    if (!reader) throw new PublicReviewError("GitHub returned an empty response. Please try again.", 502)
    const chunks: Uint8Array[] = []
    let bytes = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        bytes += value.byteLength
        totalBytes += value.byteLength
        if (bytes > PUBLIC_REVIEW_LIMITS.responseBytes || totalBytes > PUBLIC_REVIEW_LIMITS.totalResponseBytes) {
          await reader.cancel()
          tooLarge()
        }
        chunks.push(value)
      }
    } catch (error) {
      if (error instanceof PublicReviewError) throw error
      throw new PublicReviewError("GitHub's response was interrupted. Please try again.", 502)
    } finally {
      reader.releaseLock()
    }
    const data = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) {
      data.set(chunk, offset)
      offset += chunk.length
    }
    try {
      return JSON.parse(new TextDecoder().decode(data))
    } catch {
      throw new PublicReviewError("GitHub returned an invalid response. Please try again.", 502)
    }
  }
}

type GithubClient = ReturnType<typeof createPublicGithubClient>

function parseGithubData<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new PublicReviewError("GitHub returned incomplete pull request data. Please try again.", 502)
  return parsed.data
}

function repoPath(identity: PublicPrIdentity): string {
  return `/repos/${encodeURIComponent(identity.owner)}/${encodeURIComponent(identity.repo)}`
}

function assertPublicRepository(repository: z.infer<typeof repositorySchema>, identity: PublicPrIdentity): void {
  if (repository.private) throw new PublicReviewError("Only public GitHub repositories can be reviewed for free.", 403)
  if (repository.full_name.toLowerCase() !== `${identity.owner}/${identity.repo}`) {
    throw new PublicReviewError("The GitHub repository has moved. Please use its current pull request URL.", 422)
  }
}

export async function assertPublicSnapshotCurrent(snapshot: PublicPrSnapshot, github: GithubClient): Promise<void> {
  const pr = parseGithubData(prSchema, await github(`${repoPath(snapshot.identity)}/pulls/${snapshot.identity.prNumber}`))
  assertPublicRepository(pr.base.repo, snapshot.identity)
  if (pr.head.sha !== snapshot.payload.headSha || pr.base.sha !== snapshot.baseSha || pr.number !== snapshot.identity.prNumber) {
    throw new PublicReviewError("This pull request changed while it was being reviewed. Please load the latest version and try again.", 409)
  }
}

export async function fetchPublicPrSnapshot(identity: PublicPrIdentity, github: GithubClient): Promise<PublicPrSnapshot> {
  const path = repoPath(identity)
  const repository = parseGithubData(repositorySchema, await github(path))
  assertPublicRepository(repository, identity)
  const pr = parseGithubData(prSchema, await github(`${path}/pulls/${identity.prNumber}`))
  assertPublicRepository(pr.base.repo, identity)
  if (pr.base.repo.id !== repository.id || pr.number !== identity.prNumber) {
    throw new PublicReviewError("GitHub returned inconsistent pull request data. Please try again.", 502)
  }
  if (pr.changed_files > PUBLIC_REVIEW_LIMITS.files || pr.additions + pr.deletions > PUBLIC_REVIEW_LIMITS.changedLines || (pr.body?.length ?? 0) > PUBLIC_REVIEW_LIMITS.descriptionChars || pr.title.length > 512 || pr.base.ref.length > 256 || pr.head.ref.length > 256 || (pr.user?.login.length ?? 0) > 100) tooLarge()
  const data = parseGithubData(filesSchema, await github(`${path}/pulls/${identity.prNumber}/files?per_page=100&page=1`))
  if (data.length > PUBLIC_REVIEW_LIMITS.files) tooLarge()
  if (data.length !== pr.changed_files || new Set(data.map((file) => file.filename)).size !== data.length) incompleteDiff()
  const files: PrDiffFile[] = data.map((file) => ({
    filename: file.filename,
    previousFilename: file.previous_filename,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    changes: file.changes,
    patch: file.patch,
    blobUrl: `https://github.com/${identity.owner}/${identity.repo}/blob/${pr.head.sha}/${file.filename.split("/").map(encodeURIComponent).join("/")}`,
  }))
  if (files.reduce((sum, file) => sum + file.additions, 0) !== pr.additions || files.reduce((sum, file) => sum + file.deletions, 0) !== pr.deletions) incompleteDiff()
  const metadataOnlyFiles = data.filter((file) => !file.patch)
  if (metadataOnlyFiles.length) {
    for (const file of files.filter((file) => !file.patch)) assertCompletePublicPatch(file)
    const tree = parseGithubData(z.object({
      truncated: z.boolean(),
      tree: z.array(z.object({ path: z.string(), sha, type: z.string() })),
    }), await github(`${path}/git/trees/${pr.base.sha}?recursive=1`))
    if (tree.truncated || tree.tree.length > PUBLIC_REVIEW_LIMITS.treeEntries) tooLarge()
    const blobs = new Map(tree.tree.filter((item) => item.type === "blob").map((item) => [item.path, item.sha]))
    for (const file of metadataOnlyFiles) {
      const previousPath = file.previous_filename ?? (file.status === "unchanged" ? file.filename : undefined)
      if (!previousPath || blobs.get(previousPath) !== file.sha) incompleteDiff()
    }
  }
  let diff = ""
  for (const file of files) {
    if ((file.patch?.length ?? 0) > PUBLIC_REVIEW_LIMITS.diffChars) tooLarge()
    assertCompletePublicPatch(file)
    diff += `diff --git a/${file.previousFilename ?? file.filename} b/${file.filename}\n${file.patch ?? ""}\n\n`
    if (diff.length > PUBLIC_REVIEW_LIMITS.diffChars) tooLarge()
  }
  const fileSummary = files.length
    ? files.map((file) => `- \`${file.filename}\` (${file.status}, +${file.additions}/-${file.deletions})`).join("\n")
    : "_No files listed._"
  const snapshot: PublicPrSnapshot = {
    identity,
    baseSha: pr.base.sha,
    diff,
    fileSummary,
    payload: {
      headSha: pr.head.sha,
      files,
      review: {
        id: `public:${identity.owner}/${identity.repo}#${identity.prNumber}@${pr.head.sha}`,
        prNumber: identity.prNumber,
        prTitle: pr.title,
        prUrl: identity.url,
        status: "unreviewed",
        createdAt: pr.created_at,
        updatedAt: pr.updated_at,
        review: "",
        prState: pr.merged_at ? "merged" : pr.state,
        repository: { name: identity.repo, fullName: `${identity.owner}/${identity.repo}`, owner: identity.owner },
        author: pr.user?.login ?? "unknown",
        authorAvatar: pr.user ? `https://avatars.githubusercontent.com/u/${pr.user.id}?v=4` : undefined,
        body: pr.body ?? "",
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
        baseRef: pr.base.ref,
        headRef: pr.head.ref,
      },
    },
  }
  await assertPublicSnapshotCurrent(snapshot, github)
  return snapshot
}

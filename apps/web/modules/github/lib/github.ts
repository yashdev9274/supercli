import { Octokit } from "octokit"
import { auth } from "@/lib/auth"
import prisma from "@/lib/db"
import { headers } from "next/headers"

/** Refresh buffer — treat tokens expiring within 2 minutes as stale. */
const TOKEN_EXPIRY_SKEW_MS = 2 * 60 * 1000

/** In-process single-flight locks so parallel dashboard calls don't race GitHub refresh. */
const refreshInFlight = new Map<string, Promise<string>>()

export class GithubReauthRequiredError extends Error {
  readonly code = "GITHUB_REAUTH_REQUIRED" as const

  constructor(message = "GitHub authorization expired. Reconnect GitHub to continue.") {
    super(message)
    this.name = "GithubReauthRequiredError"
  }
}

export function isGithubReauthRequiredError(error: unknown): error is GithubReauthRequiredError {
  return (
    error instanceof GithubReauthRequiredError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "GITHUB_REAUTH_REQUIRED")
  )
}

type GithubAccount = {
  id: string
  userId: string
  accessToken: string | null
  refreshToken: string | null
  accessTokenExpiresAt: Date | null
  refreshTokenExpiresAt: Date | null
  updatedAt: Date
}

function isTokenExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false
  return expiresAt.getTime() - Date.now() < TOKEN_EXPIRY_SKEW_MS
}

async function loadGithubAccount(userId: string): Promise<GithubAccount | null> {
  return (await prisma.account.findFirst({
    where: {
      userId,
      providerId: "github",
    },
    orderBy: { updatedAt: "desc" },
  })) as GithubAccount | null
}

async function invalidateGithubTokens(accountId: string) {
  try {
    await prisma.account.update({
      where: { id: accountId },
      data: {
        accessToken: null,
        refreshToken: null,
        accessTokenExpiresAt: null,
        // Keep refreshTokenExpiresAt as a breadcrumb of last known auth window
      },
    })
  } catch (error) {
    console.warn("[github] failed to invalidate dead OAuth tokens:", error)
  }
}

async function probeAccessToken(token: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "supercode",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      // Cheap auth check; don't hang the dashboard
      signal: AbortSignal.timeout(8_000),
    })
    return response.ok
  } catch {
    return false
  }
}

async function refreshGithubTokenWithOAuth(account: GithubAccount): Promise<string> {
  if (!account.refreshToken) {
    await invalidateGithubTokens(account.id)
    throw new GithubReauthRequiredError(
      "GitHub access token expired and no refresh token is available. Reconnect GitHub.",
    )
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error("GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are required to refresh GitHub tokens")
  }

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: account.refreshToken,
    }),
  })

  const payload = (await response.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    refresh_token_expires_in?: number
    error?: string
    error_description?: string
  }

  if (!response.ok || !payload.access_token) {
    const detail = payload.error_description || payload.error || response.statusText
    const permanent =
      payload.error === "bad_refresh_token" ||
      /incorrect or expired|invalid_grant|bad_verification_code/i.test(detail || "")

    if (permanent) {
      // Stop retry storms — token chain is dead until the user re-auths.
      await invalidateGithubTokens(account.id)
      throw new GithubReauthRequiredError(
        `GitHub authorization expired (${detail}). Reconnect GitHub to continue.`,
      )
    }

    throw new Error(`Failed to refresh GitHub access token (${detail}).`)
  }

  const accessTokenExpiresAt =
    typeof payload.expires_in === "number"
      ? new Date(Date.now() + payload.expires_in * 1000)
      : null
  const refreshTokenExpiresAt =
    typeof payload.refresh_token_expires_in === "number"
      ? new Date(Date.now() + payload.refresh_token_expires_in * 1000)
      : account.refreshTokenExpiresAt

  await prisma.account.update({
    where: { id: account.id },
    data: {
      accessToken: payload.access_token,
      // GitHub rotates refresh tokens — always store the new one when present.
      ...(payload.refresh_token ? { refreshToken: payload.refresh_token } : {}),
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    },
  })

  return payload.access_token
}

async function refreshGithubTokenSingleFlight(account: GithubAccount): Promise<string> {
  const existing = refreshInFlight.get(account.id)
  if (existing) return existing

  const promise = (async () => {
    // Another request may have already refreshed while we waited for the lock.
    const latest = await loadGithubAccount(account.userId)
    if (!latest) {
      throw new GithubReauthRequiredError("No GitHub account linked. Reconnect GitHub.")
    }

    if (latest.accessToken && !isTokenExpired(latest.accessTokenExpiresAt)) {
      return latest.accessToken
    }

    // Access token may still work briefly past expires_at; probe before refresh.
    if (latest.accessToken && (await probeAccessToken(latest.accessToken))) {
      return latest.accessToken
    }

    try {
      const h = await headers()
      const result = await auth.api.getAccessToken({
        headers: h,
        body: {
          providerId: "github",
          accountId: latest.id,
          userId: latest.userId,
        },
      })
      if (result?.accessToken) {
        return result.accessToken
      }
    } catch {
      // No request session / better-auth refresh failed — manual refresh below.
    }

    return refreshGithubTokenWithOAuth(latest)
  })().finally(() => {
    refreshInFlight.delete(account.id)
  })

  refreshInFlight.set(account.id, promise)
  return promise
}

/**
 * Resolve a usable GitHub OAuth token for a user.
 * Refreshes expired tokens via GitHub's refresh_token grant when possible.
 * Single-flights concurrent refreshes so rotated refresh tokens aren't burned.
 * Works without a browser session (Inngest / webhooks).
 */
export async function getGithubTokenForUser(userId: string): Promise<string> {
  const account = await loadGithubAccount(userId)

  if (!account) {
    throw new GithubReauthRequiredError("No GitHub account linked. Reconnect GitHub.")
  }

  if (!account.accessToken && !account.refreshToken) {
    throw new GithubReauthRequiredError(
      "GitHub authorization expired. Reconnect GitHub to continue.",
    )
  }

  if (account.accessToken && !isTokenExpired(account.accessTokenExpiresAt)) {
    return account.accessToken
  }

  // Expired (or missing expiry) — refresh with single-flight protection.
  return refreshGithubTokenSingleFlight(account)
}

export const getGithubToken = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    throw new Error("Unauthorized")
  }

  return getGithubTokenForUser(session.user.id)
}

/** Lightweight status for dashboard UI (no token material returned). */
export async function getGithubAuthStatus(): Promise<{
  connected: boolean
  needsReauth: boolean
  accessTokenExpiresAt: string | null
}> {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session?.user) {
    return { connected: false, needsReauth: true, accessTokenExpiresAt: null }
  }

  const account = await loadGithubAccount(session.user.id)
  if (!account) {
    return { connected: false, needsReauth: true, accessTokenExpiresAt: null }
  }

  if (!account.accessToken && !account.refreshToken) {
    return {
      connected: true,
      needsReauth: true,
      accessTokenExpiresAt: account.accessTokenExpiresAt?.toISOString() ?? null,
    }
  }

  if (account.accessToken && !isTokenExpired(account.accessTokenExpiresAt)) {
    return {
      connected: true,
      needsReauth: false,
      accessTokenExpiresAt: account.accessTokenExpiresAt?.toISOString() ?? null,
    }
  }

  // Try a quiet refresh; if it fails permanently, needsReauth becomes true.
  try {
    await getGithubTokenForUser(session.user.id)
    const refreshed = await loadGithubAccount(session.user.id)
    return {
      connected: true,
      needsReauth: false,
      accessTokenExpiresAt: refreshed?.accessTokenExpiresAt?.toISOString() ?? null,
    }
  } catch (error) {
    if (isGithubReauthRequiredError(error)) {
      return {
        connected: true,
        needsReauth: true,
        accessTokenExpiresAt: account.accessTokenExpiresAt?.toISOString() ?? null,
      }
    }
    // Transient failure — don't force reauth banner
    return {
      connected: true,
      needsReauth: false,
      accessTokenExpiresAt: account.accessTokenExpiresAt?.toISOString() ?? null,
    }
  }
}

export async function fetchUserContribution(token: string, username: string) {
  const octokit = new Octokit({ auth: token })

  const query = `
    query($username:String!){
      user(login: $username) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
                color
              }
            }
          }
        }
      }
    }
    `

  try {
    const response: any = await octokit.graphql(query, {
      username,
    })

    return response.user.contributionsCollection.contributionCalendar
  } catch (error) {
    console.error("Error in fetching contributions:", error)
    return null
  }
}

export const getRepositories = async (page: number = 1, per_page = 10) => {
  const token = await getGithubToken()
  const octokit = new Octokit({ auth: token })

  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    per_page,
    page,
    sort: "updated",
    direction: "desc",
  })

  return data
}

/**
 * Public origin GitHub should POST webhooks to.
 *
 * Order:
 * 1. NEXT_PUBLIC_APP_BASE_URL — intentional override (prod domain or tunnel)
 * 2. NEXT_PUBLIC_APP_URL
 * 3. BETTER_AUTH_URL (only if not localhost)
 *
 * Do NOT point this at a host that 307/308-redirects (e.g. old Vercel alias).
 * Prefer the canonical non-redirecting deploy host.
 */
export function getGithubWebhookBaseUrl(): string {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_BASE_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
  ]
    .map((v) => (v ?? "").trim().replace(/\/$/, ""))
    .filter(Boolean)

  const publicCandidate = candidates.find(
    (url) => !/localhost|127\.0\.0\.1/i.test(url),
  )
  const baseUrl = publicCandidate || candidates[0] || ""

  if (!baseUrl) {
    throw new Error(
      "NEXT_PUBLIC_APP_BASE_URL (or NEXT_PUBLIC_APP_URL) is required to create GitHub webhooks",
    )
  }

  if (/localhost|127\.0\.0\.1/i.test(baseUrl)) {
    console.warn(
      `[github] webhook base URL is local (${baseUrl}). GitHub cannot deliver events. Use a tunnel (ngrok/cloudflared) or your production URL.`,
    )
  }

  // Known alias that 307s to supercodeai.vercel.app — Inngest/GitHub can break on redirects.
  if (/^https:\/\/supercli\.vercel\.app$/i.test(baseUrl)) {
    console.warn(
      `[github] webhook base URL ${baseUrl} redirects to https://supercodeai.vercel.app — use the canonical host instead`,
    )
  }

  return baseUrl
}

export const createWebhook = async (owner: string, repo: string) => {
  const token = await getGithubToken()

  const octokit = new Octokit({ auth: token })

  const baseUrl = getGithubWebhookBaseUrl()
  const webhookUrl = `${baseUrl}/api/webhooks/github`
  const secret = process.env.GITHUB_WEBHOOK_SECRET

  const { data: hooks } = await octokit.rest.repos.listWebhooks({
    owner,
    repo,
  })

  const existingHook = hooks.find((hook) => {
    const hookUrl = hook.config?.url
    if (!hookUrl) return false
    const normalizedHookUrl = hookUrl.replace(/\/$/, "")
    const normalizedWebhookUrl = webhookUrl.replace(/\/$/, "")
    return normalizedHookUrl === normalizedWebhookUrl
  })

  if (existingHook) {
    // Ensure the hook is active and subscribed to PR events
    try {
      await octokit.rest.repos.updateWebhook({
        owner,
        repo,
        hook_id: existingHook.id,
        active: true,
        events: ["pull_request"],
        config: {
          url: webhookUrl,
          content_type: "json",
          ...(secret ? { secret } : {}),
          insecure_ssl: "0",
        },
      })
    } catch (error) {
      console.error("[github] failed to refresh existing webhook:", error)
    }
    return existingHook
  }

  const { data } = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    active: true,
    config: {
      url: webhookUrl,
      content_type: "json",
      ...(secret ? { secret } : {}),
      insecure_ssl: "0",
    },
    events: ["pull_request"],
  })

  return data
}

export const deleteWebhook = async (owner: string, repo: string) => {
  const token = await getGithubToken()

  const octokit = new Octokit({ auth: token })

  const baseUrl = getGithubWebhookBaseUrl()
  const webhookUrl = `${baseUrl}/api/webhooks/github`

  try {
    const { data: hooks } = await octokit.rest.repos.listWebhooks({
      owner,
      repo,
    })

    const hookToDelete = hooks.find((hook) => hook.config.url === webhookUrl)

    if (hookToDelete) {
      await octokit.rest.repos.deleteWebhook({
        owner,
        repo,
        hook_id: hookToDelete.id,
      })
      return true
    }
    return false
  } catch (error) {
    console.error("Error deleting webhook:", error)
    throw error
  }
}

const BINARY_EXTENSIONS =
  /\.(png|jpe?g|gif|svg|ico|webp|pdf|zip|tar|gz|tgz|bz2|7z|rar|woff2?|ttf|eot|mp[34]|wav|mov|avi|mkv|webm|lock|bin|exe|dll|so|dylib|class|jar|wasm|parquet|pkl|npy|onnx|pt|safetensors)$/i

const SKIP_PATH_SEGMENTS = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  "coverage/",
  "__pycache__/",
  ".turbo/",
  "vendor/",
  ".venv/",
  "venv/",
]

const MAX_FILE_BYTES = 200_000

function shouldIndexPath(path: string): boolean {
  if (BINARY_EXTENSIONS.test(path)) return false
  if (path.endsWith(".min.js") || path.endsWith(".min.css")) return false
  if (
    path.endsWith("bun.lock") ||
    path.endsWith("package-lock.json") ||
    path.endsWith("yarn.lock") ||
    path.endsWith("pnpm-lock.yaml")
  ) {
    return false
  }
  return !SKIP_PATH_SEGMENTS.some((segment) => path.includes(segment))
}

/** List indexable file paths via the Git Trees API (1 request). */
export async function listRepoFilePaths(
  token: string,
  owner: string,
  repo: string,
): Promise<string[]> {
  const octokit = new Octokit({ auth: token })

  const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
  const defaultBranch = repoData.default_branch

  const { data: ref } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  })

  const { data: tree } = await octokit.rest.git.getTree({
    owner,
    repo,
    tree_sha: ref.object.sha,
    recursive: "true",
  })

  return (tree.tree ?? [])
    .filter((item) => item.type === "blob" && item.path && shouldIndexPath(item.path))
    .filter((item) => !item.size || item.size <= MAX_FILE_BYTES)
    .map((item) => item.path as string)
}

/** Fetch contents for a list of paths (batched Contents API). */
export async function getRepoFileContentsByPaths(
  token: string,
  owner: string,
  repo: string,
  paths: string[],
): Promise<{ path: string; content: string }[]> {
  const octokit = new Octokit({ auth: token })
  const files: { path: string; content: string }[] = []

  // Keep concurrency modest to avoid secondary rate limits
  const concurrency = 8
  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency)
    const results = await Promise.all(
      batch.map(async (path) => {
        try {
          const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path,
          })

          if (Array.isArray(data) || data.type !== "file" || !("content" in data) || !data.content) {
            return null
          }

          // GitHub Contents API only returns content for files under ~1MB
          if (data.encoding !== "base64") {
            return null
          }

          const content = Buffer.from(data.content, "base64").toString("utf-8")
          // Skip likely-binary / empty
          if (!content.trim()) return null
          if (content.includes("\u0000")) return null

          return { path: data.path, content }
        } catch (error) {
          console.error(`[github] failed to fetch ${path}:`, error)
          return null
        }
      }),
    )

    for (const result of results) {
      if (result) files.push(result)
    }
  }

  return files
}

/** @deprecated Prefer listRepoFilePaths + getRepoFileContentsByPaths for large repos. */
export async function getRepoFileContents(
  token: string,
  owner: string,
  repo: string,
  path: string = "",
): Promise<{ path: string; content: string }[]> {
  // Keep recursive Contents-API path for single-directory callers / tests,
  // but use the tree API for full-repo walks.
  if (path === "") {
    const paths = await listRepoFilePaths(token, owner, repo)
    return getRepoFileContentsByPaths(token, owner, repo, paths)
  }

  const octokit = new Octokit({ auth: token })

  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path,
  })

  if (!Array.isArray(data)) {
    if (data.type === "file" && data.content && shouldIndexPath(data.path)) {
      return [{
        path: data.path,
        content: Buffer.from(data.content, "base64").toString("utf-8"),
      }]
    }
    return []
  }

  let files: { path: string; content: string }[] = []

  for (const item of data) {
    if (item.type === "file" && shouldIndexPath(item.path)) {
      const { data: fileData } = await octokit.rest.repos.getContent({
        owner,
        repo,
        path: item.path,
      })

      if (!Array.isArray(fileData) && fileData.type === "file" && fileData.content) {
        files.push({
          path: item.path,
          content: Buffer.from(fileData.content, "base64").toString("utf-8"),
        })
      }
    } else if (item.type === "dir") {
      const subFiles = await getRepoFileContents(token, owner, repo, item.path)
      files = files.concat(subFiles)
    }
  }

  return files
}

const MAX_DIFF_CHARS = 120_000
const SUPERCODE_REVIEW_MARKER = "<!-- supercode-ai-review -->"

/** List open (non-draft) pull requests for auto-review backfill. */
export async function listOpenPullRequests(
  token: string,
  owner: string,
  repo: string,
  options?: { limit?: number },
): Promise<
  Array<{
    number: number
    title: string
    htmlUrl: string
    draft: boolean
    author: string
  }>
> {
  const octokit = new Octokit({ auth: token })
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 50)

  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: limit,
  })

  return data
    .filter((pr) => !pr.draft)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      htmlUrl: pr.html_url,
      draft: Boolean(pr.draft),
      author: pr.user?.login ?? "unknown",
    }))
}

export async function getPullRequestDiff(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
) {
  const octokit = new Octokit({ auth: token })

  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  })

  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  })

  const { data: diff } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
    mediaType: {
      format: "diff",
    },
  })

  let diffText = diff as unknown as string
  if (diffText.length > MAX_DIFF_CHARS) {
    diffText =
      diffText.slice(0, MAX_DIFF_CHARS) +
      `\n\n...[diff truncated at ${MAX_DIFF_CHARS} chars]...`
  }

  return {
    diff: diffText,
    title: pr.title,
    description: pr.body || "",
    headSha: pr.head.sha,
    baseSha: pr.base.sha,
    author: pr.user?.login ?? "unknown",
    changedFiles: files.map((f) => ({
      filename: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch?.slice(0, 4000),
    })),
    additions: pr.additions,
    deletions: pr.deletions,
    draft: pr.draft ?? false,
  }
}

function formatReviewBody(review: string): string {
  return [
    SUPERCODE_REVIEW_MARKER,
    "## 🤖 Supercode AI Review",
    "",
    review.trim(),
    "",
    "---",
    "*Automated review by [Supercode](https://supercli.com) · leave a 👍/👎 reaction to rate this review*",
  ].join("\n")
}

/**
 * Post (or update) a single sticky Supercode review comment on a PR.
 * Re-runs update the same comment instead of creating duplicates.
 */
export async function postReviewComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  review: string,
  // Kept for call-site compatibility; unused (we only post one sticky comment).
  _options?: { headSha?: string; event?: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" },
) {
  const octokit = new Octokit({ auth: token })
  const body = formatReviewBody(review)

  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
    per_page: 100,
  })

  const existing = comments.find((c) => c.body?.includes(SUPERCODE_REVIEW_MARKER))

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    })
    console.log(
      `[github] updated sticky review comment on ${owner}/${repo}#${prNumber} comment_id=${existing.id}`,
    )
    return
  }

  const { data: created } = await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: prNumber,
    body,
  })
  console.log(
    `[github] created sticky review comment on ${owner}/${repo}#${prNumber} comment_id=${created.id}`,
  )
}

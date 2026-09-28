import { createSign } from "node:crypto"

import { NOVA_CONTRACT_VERSION, type NormalizedInboundEvent } from "@super/nova"
import { getCredential } from "@super/secrets"

export type GitHubAppCredential = {
  installationId: number
}

type GitHubWebhookEnvelope = {
  action?: string
  installation?: { id?: number }
  sender?: { id?: number; login?: string; type?: string }
  repository?: { id?: number; full_name?: string; html_url?: string }
  issue?: {
    id?: number
    number?: number
    title?: string
    body?: string | null
    html_url?: string
    assignees?: Array<{ login?: string }>
    pull_request?: unknown
  }
  pull_request?: {
    id?: number
    number?: number
    title?: string
    body?: string | null
    html_url?: string
    assignees?: Array<{ login?: string }>
  }
  comment?: { id?: number; body?: string; html_url?: string }
  review?: { id?: number; body?: string; html_url?: string }
}

type GitHubInstallation = {
  id?: number
  account?: { id?: number; login?: string }
  permissions?: Record<string, string>
  repository_selection?: string
}

type GitHubPullRequest = {
  number?: number
  title?: string
  body?: string | null
  html_url?: string
  state?: string
  draft?: boolean
  user?: { login?: string }
  base?: { ref?: string; sha?: string }
  head?: { ref?: string; sha?: string }
  changed_files?: number
  additions?: number
  deletions?: number
}

type GitHubPullFile = {
  filename?: string
  status?: string
  additions?: number
  deletions?: number
  changes?: number
  patch?: string
}

type GitHubCheckRuns = {
  check_runs?: Array<{ name?: string; status?: string; conclusion?: string | null; html_url?: string }>
}

export type GitHubPullRequestContext = {
  repository: string
  number: number
  title: string
  body: string
  url: string | null
  state: string
  draft: boolean
  author: string | null
  baseBranch: string | null
  headBranch: string | null
  headSha: string
  changedFiles: Array<{
    path: string
    status: string
    additions: number
    deletions: number
    patch: string | null
  }>
  checks: Array<{ name: string; status: string; conclusion: string | null; url: string | null }>
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url")
}

function githubAppJwt(): string {
  const appId = process.env.NOVA_GITHUB_APP_ID?.trim()
  const privateKey = process.env.NOVA_GITHUB_PRIVATE_KEY?.replace(/\\n/g, "\n")
  if (!appId || !privateKey) throw new Error("Nova GitHub App authentication is not configured")

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: appId }))
  const unsigned = `${header}.${payload}`
  const signer = createSign("RSA-SHA256")
  signer.update(unsigned)
  signer.end()
  return `${unsigned}.${signer.sign(privateKey, "base64url")}`
}

async function githubRequest<T>(url: string, init: RequestInit & { token: string }): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${init.token}`,
      "Content-Type": "application/json",
      "User-Agent": "supercode-nova",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
    cache: "no-store",
  })
  const result = await response.json() as T & { message?: string }
  if (!response.ok) throw new Error(`GitHub API failed: ${result.message ?? response.status}`)
  return result
}

export async function getGitHubInstallation(installationId: number): Promise<GitHubInstallation> {
  return githubRequest<GitHubInstallation>(`https://api.github.com/app/installations/${installationId}`, {
    method: "GET",
    token: githubAppJwt(),
  })
}

async function installationAccessToken(credentialRef: string): Promise<string> {
  const credential = await getCredential<GitHubAppCredential>(credentialRef)
  if (!Number.isSafeInteger(credential.installationId)) {
    throw new Error("GitHub credential is missing an installation ID")
  }
  const result = await githubRequest<{ token?: string }>(
    `https://api.github.com/app/installations/${credential.installationId}/access_tokens`,
    { method: "POST", token: githubAppJwt() },
  )
  if (!result.token) throw new Error("GitHub did not return an installation access token")
  return result.token
}

export async function readGitHubPullRequest(input: {
  credentialRef: string
  repository: string
  pullNumber: number
}): Promise<GitHubPullRequestContext> {
  const [owner, repo, extra] = input.repository.split("/")
  if (!owner || !repo || extra || !Number.isSafeInteger(input.pullNumber) || input.pullNumber <= 0) {
    throw new Error("GitHub pull request target is invalid")
  }
  const token = await installationAccessToken(input.credentialRef)
  const root = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  const pull = await githubRequest<GitHubPullRequest>(
    `${root}/pulls/${input.pullNumber}`,
    { method: "GET", token },
  )
  if (!pull.head?.sha || !pull.title) throw new Error("GitHub returned an incomplete pull request")
  const [files, checks] = await Promise.all([
    githubRequest<GitHubPullFile[]>(
      `${root}/pulls/${input.pullNumber}/files?per_page=50`,
      { method: "GET", token },
    ),
    githubRequest<GitHubCheckRuns>(
      `${root}/commits/${encodeURIComponent(pull.head.sha)}/check-runs?per_page=50`,
      { method: "GET", token },
    ),
  ])
  return {
    repository: input.repository,
    number: input.pullNumber,
    title: pull.title,
    body: pull.body?.slice(0, 8_000) ?? "",
    url: pull.html_url ?? null,
    state: pull.state ?? "unknown",
    draft: pull.draft ?? false,
    author: pull.user?.login ?? null,
    baseBranch: pull.base?.ref ?? null,
    headBranch: pull.head.ref ?? null,
    headSha: pull.head.sha,
    changedFiles: files.slice(0, 50).map((file) => ({
      path: file.filename ?? "unknown",
      status: file.status ?? "unknown",
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
      patch: file.patch?.slice(0, 4_000) ?? null,
    })),
    checks: (checks.check_runs ?? []).slice(0, 50).map((check) => ({
      name: check.name ?? "unknown",
      status: check.status ?? "unknown",
      conclusion: check.conclusion ?? null,
      url: check.html_url ?? null,
    })),
  }
}

export function parseGitHubEnvelope(input: unknown): GitHubWebhookEnvelope | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as GitHubWebhookEnvelope
    : null
}

function mentionsNova(text: string, appSlug: string): boolean {
  const escaped = appSlug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(^|\\s)@${escaped}(?:\\[bot\\])?(?=\\s|$|[.,:;!?])`, "i").test(text)
}

export function normalizeGitHubEvent(input: {
  eventName: string
  deliveryId: string
  envelope: GitHubWebhookEnvelope
  organizationId: string
  installationId: string
  appSlug: string
  botExternalUserId: string | null
}): NormalizedInboundEvent | null {
  const { envelope } = input
  const repository = envelope.repository?.full_name
  const subject = envelope.issue ?? envelope.pull_request
  const number = subject?.number
  if (!repository || !number || !subject) return null
  if (input.botExternalUserId && envelope.sender?.login === input.botExternalUserId) return null
  if (envelope.sender?.type === "Bot") return null

  const commentBody = envelope.comment?.body ?? envelope.review?.body
  const subjectBody = subject.body ?? ""
  const assigned = envelope.action === "assigned" && subject.assignees?.some(
    (assignee) => assignee.login === input.botExternalUserId || assignee.login === `${input.appSlug}[bot]`,
  )
  const mentioned = Boolean(commentBody && mentionsNova(commentBody, input.appSlug))
  if (!assigned && !mentioned) return null
  if (input.eventName !== "issues" &&
    input.eventName !== "issue_comment" &&
    input.eventName !== "pull_request" &&
    input.eventName !== "pull_request_review_comment" &&
    input.eventName !== "pull_request_review") return null

  const externalId = envelope.comment?.id ?? envelope.review?.id ?? subject.id ?? number
  return {
    contractVersion: NOVA_CONTRACT_VERSION,
    organizationId: input.organizationId,
    installationId: input.installationId,
    provider: "github",
    providerDeliveryId: input.deliveryId,
    eventType: assigned ? "assigned" : "mention",
    actorExternalId: envelope.sender?.login ?? null,
    surface: {
      externalSurfaceId: `${repository}#${number}`,
      externalContainerId: repository,
    },
    occurredAt: new Date().toISOString(),
    payload: {
      text: (commentBody || subjectBody || subject.title || "Nova was assigned").trim(),
      externalId: String(externalId),
      repository,
      number,
      url: envelope.comment?.html_url ?? envelope.review?.html_url ?? subject.html_url ?? null,
      isPullRequest: Boolean(envelope.issue?.pull_request || envelope.pull_request),
    },
  }
}

export async function postGitHubReply(input: {
  credentialRef: string
  repository: string
  issueNumber: number
  text: string
}): Promise<string> {
  const [owner, repo] = input.repository.split("/")
  if (!owner || !repo) throw new Error("GitHub surface has an invalid repository")
  const token = await installationAccessToken(input.credentialRef)
  const result = await githubRequest<{ id?: number }>(
    `https://api.github.com/repos/${owner}/${repo}/issues/${input.issueNumber}/comments`,
    { method: "POST", token, body: JSON.stringify({ body: input.text }) },
  )
  if (!result.id) throw new Error("GitHub did not create the Nova reply")
  return String(result.id)
}

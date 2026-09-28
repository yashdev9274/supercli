import { createSign } from "node:crypto"

import { NOVA_CONTRACT_VERSION, type NormalizedInboundEvent } from "@super/nova"

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

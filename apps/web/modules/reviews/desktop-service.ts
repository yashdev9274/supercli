import prisma from "@super/db"
import { Octokit } from "octokit"

import { reviewPullRequest } from "@/modules/ai/action"
import { getGithubTokenForUser } from "@/modules/github/lib/github"

export type DesktopReviewStatus =
  | "completed"
  | "pending"
  | "failed"
  | "unreviewed"
  | "skipped"
  | "trial_ended"

export type DesktopReviewState = "open" | "closed" | "merged"

type ConnectedRepository = {
  id: string
  name: string
  fullName: string
  owner: string
}

function encodeReviewId(fullName: string, prNumber: number) {
  return `${fullName.replace("/", "__")}__${prNumber}`
}

function parseReviewId(id: string) {
  const separator = id.lastIndexOf("__")
  if (separator <= 0) return null
  const fullName = id.slice(0, separator).replace("__", "/")
  const prNumber = Number(id.slice(separator + 2))
  if (!fullName.includes("/") || !Number.isInteger(prNumber) || prNumber <= 0) {
    return null
  }
  return { fullName, prNumber }
}

function summary(text?: string | null, max = 180) {
  if (!text) return undefined
  const cleaned = text.replace(/\s+/g, " ").trim()
  return cleaned.length > max ? `${cleaned.slice(0, max).trimEnd()}…` : cleaned
}

function prState(pr: { state: string; merged_at: string | null }): DesktopReviewState {
  if (pr.merged_at) return "merged"
  return pr.state === "closed" ? "closed" : "open"
}

async function repositoriesForUser(userId: string): Promise<ConnectedRepository[]> {
  return prisma.repository.findMany({
    where: { userId },
    select: { id: true, name: true, fullName: true, owner: true },
    orderBy: { updatedAt: "desc" },
    take: 20,
  })
}

async function resolveIdentity(userId: string, id: string) {
  const stored = await prisma.review.findFirst({
    where: { id, repository: { userId } },
    include: {
      repository: { select: { id: true, name: true, fullName: true, owner: true } },
    },
  })
  if (stored) {
    return { repository: stored.repository, prNumber: stored.prNumber, stored }
  }

  const parsed = parseReviewId(id)
  if (!parsed) return null
  const repository = await prisma.repository.findFirst({
    where: { userId, fullName: parsed.fullName },
    select: { id: true, name: true, fullName: true, owner: true },
  })
  return repository ? { repository, prNumber: parsed.prNumber, stored: null } : null
}

export async function listDesktopReviews(userId: string) {
  const repositories = await repositoriesForUser(userId)
  if (!repositories.length) return []

  const storedReviews = await prisma.review.findMany({
    where: { repositoryId: { in: repositories.map((repository) => repository.id) } },
    orderBy: { updatedAt: "desc" },
  })
  const storedByKey = new Map(
    storedReviews.map((review) => [`${review.repositoryId}:${review.prNumber}`, review]),
  )

  let token: string | null = null
  try {
    token = await getGithubTokenForUser(userId)
  } catch {
    token = null
  }

  if (!token) {
    return storedReviews.map((review) => {
      const repository = repositories.find((item) => item.id === review.repositoryId)!
      return {
        id: encodeReviewId(repository.fullName, review.prNumber),
        prNumber: review.prNumber,
        prTitle: review.prTitle,
        prUrl: review.prUrl,
        status: review.status as DesktopReviewStatus,
        summary: summary(review.review),
        createdAt: review.createdAt,
        updatedAt: review.updatedAt,
        repository,
      }
    })
  }

  const octokit = new Octokit({ auth: token })
  const items: Array<Record<string, unknown>> = []
  for (const repository of repositories) {
    try {
      const { data: pulls } = await octokit.rest.pulls.list({
        owner: repository.owner,
        repo: repository.name,
        state: "all",
        sort: "updated",
        direction: "desc",
        per_page: 15,
      })
      for (const pull of pulls) {
        const stored = storedByKey.get(`${repository.id}:${pull.number}`)
        items.push({
          id: encodeReviewId(repository.fullName, pull.number),
          prNumber: pull.number,
          prTitle: pull.title,
          prUrl: pull.html_url,
          status: (stored?.status ?? "unreviewed") as DesktopReviewStatus,
          summary: summary(stored?.review ?? pull.body),
          author: pull.user?.login,
          authorAvatar: pull.user?.avatar_url,
          additions: undefined,
          deletions: undefined,
          prState: prState(pull),
          createdAt: pull.created_at,
          updatedAt: pull.updated_at,
          repository,
        })
      }
    } catch (error) {
      console.error(`[desktop/reviews] Failed to list ${repository.fullName}:`, error)
    }
  }

  return items.sort(
    (left, right) =>
      new Date(String(right.updatedAt)).getTime() - new Date(String(left.updatedAt)).getTime(),
  )
}

export async function getDesktopReview(userId: string, id: string) {
  const identity = await resolveIdentity(userId, id)
  if (!identity) return null

  const token = await getGithubTokenForUser(userId)
  const octokit = new Octokit({ auth: token })
  const { data: pull } = await octokit.rest.pulls.get({
    owner: identity.repository.owner,
    repo: identity.repository.name,
    pull_number: identity.prNumber,
  })

  const stored =
    identity.stored ??
    (await prisma.review.findUnique({
      where: {
        repositoryId_prNumber: {
          repositoryId: identity.repository.id,
          prNumber: identity.prNumber,
        },
      },
    }))

  return {
    id: encodeReviewId(identity.repository.fullName, identity.prNumber),
    prNumber: identity.prNumber,
    prTitle: pull.title,
    prUrl: pull.html_url,
    status: (stored?.status ?? "unreviewed") as DesktopReviewStatus,
    review: stored?.review ?? "",
    summary: summary(stored?.review ?? pull.body),
    prState: prState(pull),
    author: pull.user?.login,
    authorName: pull.user?.name,
    authorAvatar: pull.user?.avatar_url,
    body: pull.body,
    additions: pull.additions,
    deletions: pull.deletions,
    changedFiles: pull.changed_files,
    baseRef: pull.base.ref,
    headRef: pull.head.ref,
    createdAt: stored?.createdAt ?? pull.created_at,
    updatedAt: stored?.updatedAt ?? pull.updated_at,
    repository: identity.repository,
  }
}

export async function getDesktopReviewFiles(userId: string, id: string) {
  const identity = await resolveIdentity(userId, id)
  if (!identity) return null

  const token = await getGithubTokenForUser(userId)
  const octokit = new Octokit({ auth: token })
  const files: Array<Record<string, unknown>> = []
  for (let page = 1; page <= 5; page += 1) {
    const { data } = await octokit.rest.pulls.listFiles({
      owner: identity.repository.owner,
      repo: identity.repository.name,
      pull_number: identity.prNumber,
      per_page: 100,
      page,
    })
    for (const file of data) {
      files.push({
        filename: file.filename,
        previousFilename: file.previous_filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: file.patch,
        blobUrl: file.blob_url,
        rawUrl: file.raw_url,
      })
    }
    if (data.length < 100) break
  }
  return files
}

export async function triggerDesktopReview(userId: string, id: string) {
  const identity = await resolveIdentity(userId, id)
  if (!identity) return null

  return reviewPullRequest(
    identity.repository.owner,
    identity.repository.name,
    identity.prNumber,
    { userId, source: "desktop", wait: true },
  )
}

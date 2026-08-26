"use server"

import {
  createWebhook,
  getGithubToken,
  getRepositories,
  listOpenPullRequests,
} from "@/modules/github/lib/github"
import { reviewPullRequest } from "@/modules/ai/action"
import { auth } from "@super/auth/server"
import prisma from "@super/db"
import { headers } from "next/headers"
import { inngest } from "@/inngest/client"

/** Cap how many existing open PRs we auto-queue on connect. */
const CONNECT_BACKFILL_LIMIT = 10

export const fetchRepositories = async (page: number = 1, perPage: number = 10) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    throw new Error("Unauthorized")
  }

  const githubRepos = await getRepositories(page, perPage)

  const dbRepos = await prisma.repository.findMany({
    where: {
      userId: session.user.id,
    },
  })

  const connectedRepoIds = new Set(dbRepos.map((repo) => repo.githubId))

  return githubRepos.map((repo) => ({
    ...repo,
    isConnected: connectedRepoIds.has(BigInt(repo.id)),
  }))
}

export const connectRepository = async (
  owner: string,
  repo: string,
  githubId: number,
) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  })

  if (!session) {
    throw new Error("Unauthorized")
  }

  // TODO: CHECK IF USER CAN CONNECT MORE REPO

  // Install pull_request webhook so new PRs auto-queue AI reviews.
  const webhook = await createWebhook(owner, repo)

  if (webhook) {
    await prisma.repository.create({
      data: {
        githubId: BigInt(githubId),
        name: repo,
        owner,
        fullName: `${owner}/${repo}`,
        url: `https://github.com/${owner}/${repo}`,
        userId: session.user.id,
      },
    })
  }

  // Index codebase for RAG context used by reviews.
  try {
    await inngest.send({
      name: "repository-connected",
      data: {
        owner,
        repo,
        userId: session.user.id,
      },
    })
  } catch (error) {
    console.error("[connectRepository] failed to trigger indexing:", error)
  }

  // Backfill: queue AI reviews for currently open non-draft PRs so users
  // don't wait for the next webhook (opened/synchronize) event.
  try {
    const token = await getGithubToken()
    const openPrs = await listOpenPullRequests(token, owner, repo, {
      limit: CONNECT_BACKFILL_LIMIT,
    })

    console.log(
      `[connectRepository] backfilling ${openPrs.length} open PR(s) for ${owner}/${repo}`,
    )

    for (const pr of openPrs) {
      try {
        await reviewPullRequest(owner, repo, pr.number, {
          userId: session.user.id,
          prTitle: pr.title,
          source: "repo_connect_backfill",
        })
      } catch (error) {
        console.error(
          `[connectRepository] failed to queue review for ${owner}/${repo}#${pr.number}:`,
          error,
        )
      }
    }
  } catch (error) {
    console.error(
      `[connectRepository] open-PR backfill failed for ${owner}/${repo}:`,
      error,
    )
  }

  return webhook
}

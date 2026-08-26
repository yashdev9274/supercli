import { inngest } from "@/inngest/client"
import prisma from "@super/db"

export async function reviewPullRequest(
  owner: string,
  repo: string,
  prNumber: number,
) {
  try {
    const repository = await prisma.repository.findFirst({
      where: {
        owner,
        name: repo,
      },
      include: {
        user: {
          include: {
            accounts: {
              where: {
                providerId: "github",
              },
            },
          },
        },
      },
    })

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
      },
      create: {
        repositoryId: repository.id,
        prNumber,
        prTitle: "Review queued…",
        prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
        review: "Waiting for AI review worker…",
        status: "pending",
      },
    })

    await inngest.send({
      name: "pr.review.requested",
      data: {
        owner,
        repo,
        prNumber,
        userId: repository.user.id,
      },
    })

    console.log(
      `[reviewPullRequest] queued pr.review.requested for ${owner}/${repo}#${prNumber} user=${repository.user.id}`,
    )

    return { success: true, message: "Review queued" }
  } catch (error) {
    console.error(
      `[reviewPullRequest] failed for ${owner}/${repo}#${prNumber}:`,
      error,
    )

    try {
      const repository = await prisma.repository.findFirst({
        where: { owner, name: repo },
      })

      if (repository) {
        await prisma.review.upsert({
          where: {
            repositoryId_prNumber: {
              repositoryId: repository.id,
              prNumber,
            },
          },
          update: {
            review: `Error: ${error instanceof Error ? error.message : "Unknown Error"}`,
            status: "failed",
          },
          create: {
            repositoryId: repository.id,
            prNumber,
            prTitle: "Failed to queue review",
            prUrl: `https://github.com/${owner}/${repo}/pull/${prNumber}`,
            review: `Error: ${error instanceof Error ? error.message : "Unknown Error"}`,
            status: "failed",
          },
        })
      }
    } catch (dbError) {
      console.error("[reviewPullRequest] failed to save error:", dbError)
    }

    // Re-throw so webhook logs show the real failure
    throw error
  }
}

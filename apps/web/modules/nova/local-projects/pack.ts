import { Octokit } from "octokit"

import prisma from "@super/db"
import { getGithubTokenForUser } from "@/modules/github/lib/github"
import {
  MAX_LOCAL_FILE_BYTES,
  MAX_LOCAL_TOTAL_BYTES,
  type LocalAttachment,
} from "@/modules/nova/attachments/contracts"
import type { LocalProjectSummary } from "@/modules/nova/local-projects/contracts"
import {
  isLikelyTextProjectPath,
  MAX_PROJECT_PACK_FILES,
  rankProjectPaths,
} from "@/modules/nova/local-projects/rank-paths"

async function githubForUser(userId: string) {
  try {
    return new Octokit({ auth: await getGithubTokenForUser(userId), request: { timeout: 20_000 } })
  } catch {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!user?.email) return null
    const { default: terminalPrisma } = await import("@super/db-terminal")
    const account = await terminalPrisma.account.findFirst({
      where: { providerId: "github", user: { email: { equals: user.email, mode: "insensitive" } } },
      select: { accessToken: true, accessTokenExpiresAt: true },
    })
    if (!account?.accessToken || (account.accessTokenExpiresAt && account.accessTokenExpiresAt <= new Date())) {
      return null
    }
    return new Octokit({ auth: account.accessToken, request: { timeout: 20_000 } })
  }
}

/**
 * Pull the most relevant files from a GitHub-backed local project into turn attachments.
 * Query-matched source wins over bootstrap configs.
 */
export async function packGithubProjectForTurn(
  userId: string,
  project: LocalProjectSummary,
  objective: string,
  existing: LocalAttachment[] = [],
): Promise<LocalAttachment[]> {
  const fullName = project.repositoryFullName
  if (!fullName) return existing
  const [owner, name] = fullName.split("/")
  if (!owner || !name) return existing

  const paths = (project.paths ?? []).filter(isLikelyTextProjectPath)
  if (paths.length === 0) return existing

  const github = await githubForUser(userId)
  if (!github) return existing

  const room = Math.max(0, MAX_PROJECT_PACK_FILES - existing.length)
  if (room === 0) return existing

  const candidates = rankProjectPaths(paths, objective, room)
  const packed = [...existing]
  let total = packed.reduce((sum, file) => sum + file.size, 0)
  const seen = new Set(packed.map((file) => file.name))

  // Fetch in small parallel batches for speed
  const batchSize = 4
  for (let i = 0; i < candidates.length; i += batchSize) {
    if (packed.length >= MAX_PROJECT_PACK_FILES || total >= MAX_LOCAL_TOTAL_BYTES) break
    const batch = candidates.slice(i, i + batchSize).filter((item) => !seen.has(item.path))
    const results = await Promise.all(
      batch.map(async ({ path }) => {
        try {
          const { data } = await github.rest.repos.getContent({ owner, repo: name, path })
          if (Array.isArray(data) || data.type !== "file" || !("content" in data) || typeof data.content !== "string") {
            return null
          }
          if ((data.size ?? 0) > MAX_LOCAL_FILE_BYTES) return null
          const text = Buffer.from(data.content, (data.encoding as BufferEncoding) || "base64").toString("utf8")
          if (text.includes("\0")) return null
          const size = Math.min(text.length, MAX_LOCAL_FILE_BYTES)
          return {
            id: `gh_${path.replace(/[^\w]+/g, "_").slice(0, 40)}`,
            kind: "text" as const,
            name: path,
            mediaType: "text/plain",
            size,
            text: text.slice(0, MAX_LOCAL_FILE_BYTES),
          } satisfies LocalAttachment
        } catch {
          return null
        }
      }),
    )

    for (const attachment of results) {
      if (!attachment) continue
      if (packed.length >= MAX_PROJECT_PACK_FILES) break
      if (seen.has(attachment.name)) continue
      if (total + attachment.size > MAX_LOCAL_TOTAL_BYTES) continue
      packed.push(attachment)
      seen.add(attachment.name)
      total += attachment.size
    }
  }

  return packed
}

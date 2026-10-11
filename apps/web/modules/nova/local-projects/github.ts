import { Octokit } from "octokit"

import prisma from "@super/db"
import { getGithubTokenForUser } from "@/modules/github/lib/github"
import { isReferenceFile } from "@/modules/nova/references/service"
import { MAX_PROJECT_PATHS } from "@/modules/nova/local-projects/contracts"
import { createLocalProject, listLocalProjects, updateLocalProject } from "@/modules/nova/local-projects/service"

const MAX_FILE_BYTES = 64 * 1024

async function githubForUser(userId: string) {
  try {
    return new Octokit({ auth: await getGithubTokenForUser(userId), request: { timeout: 20_000 } })
  } catch {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!user?.email) throw new Error("GitHub authorization is unavailable")
    const { default: terminalPrisma } = await import("@super/db-terminal")
    const account = await terminalPrisma.account.findFirst({
      where: { providerId: "github", user: { email: { equals: user.email, mode: "insensitive" } } },
      select: { accessToken: true, accessTokenExpiresAt: true },
    })
    if (!account?.accessToken || (account.accessTokenExpiresAt && account.accessTokenExpiresAt <= new Date())) {
      throw new Error("GitHub authorization is unavailable. Connect GitHub in settings.")
    }
    return new Octokit({ auth: account.accessToken, request: { timeout: 20_000 } })
  }
}

export async function indexGithubRepository(
  userId: string,
  fullName: string,
): Promise<{ paths: string[]; truncated: boolean; rootName: string; displayName: string }> {
  const [owner, name] = fullName.split("/")
  if (!owner || !name) throw new Error("Invalid repository name")

  const repo = await prisma.repository.findFirst({
    where: { userId, fullName },
    select: { id: true, owner: true, name: true, fullName: true },
  })
  if (!repo) throw new Error("Repository is not connected to your account")

  const github = await githubForUser(userId)
  const { data: remote } = await github.rest.repos.get({ owner: repo.owner, repo: repo.name })
  const branch = remote.default_branch || "main"
  const { data: tree } = await github.rest.git.getTree({
    owner: repo.owner,
    repo: repo.name,
    tree_sha: branch,
    recursive: "true",
  })

  const paths = (tree.tree ?? [])
    .flatMap((item) =>
      item.type === "blob"
      && item.path
      && isReferenceFile(item.path)
      && (item.size ?? 0) <= MAX_FILE_BYTES
        ? [item.path]
        : [],
    )
    .slice(0, MAX_PROJECT_PATHS)

  return {
    paths,
    truncated: Boolean(tree.truncated) || (tree.tree?.length ?? 0) > paths.length,
    rootName: repo.name,
    displayName: repo.fullName,
  }
}

/** Create or refresh a WebLocalProject bound to a connected GitHub repo. */
export async function upsertGithubLocalProject(userId: string, fullName: string) {
  const indexed = await indexGithubRepository(userId, fullName)
  const existing = (await listLocalProjects(userId)).find(
    (project) => project.repositoryFullName?.toLowerCase() === fullName.toLowerCase(),
  )

  if (existing) {
    return updateLocalProject(userId, existing.id, {
      displayName: indexed.displayName,
      paths: indexed.paths,
      truncated: indexed.truncated,
      repositoryFullName: fullName,
      status: "active",
    })
  }

  return createLocalProject(userId, {
    displayName: indexed.displayName,
    rootName: indexed.rootName,
    paths: indexed.paths,
    truncated: indexed.truncated,
    repositoryFullName: fullName,
  })
}

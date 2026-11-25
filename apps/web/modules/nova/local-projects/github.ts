import { Octokit } from "octokit"
import { z } from "zod"

import prisma from "@super/db"
import { getGithubTokenForUser } from "@/modules/github/lib/github"
import { isReferenceFile } from "@/modules/nova/references/service"
import { MAX_PROJECT_PATHS } from "@/modules/nova/local-projects/contracts"
import { createLocalProject, listLocalProjects, updateLocalProject } from "@/modules/nova/local-projects/service"
import { assertGithubSourceRepository, githubSourceFromPolicy } from "./github-source"

const MAX_FILE_BYTES = 64 * 1024

export const githubSourceFilePathSchema = z.string().min(1).max(1024).refine((path) =>
  !path.startsWith("/") && !/[\\\x00-\x1f\x7f]/.test(path)
  && !path.split("/").some((part) => !part || part === "." || part === ".." || part === ".git"),
)

export async function readSessionGithubSourceFile(userId: string, sessionId: string, path?: string) {
  if (path !== undefined) githubSourceFilePathSchema.parse(path)
  const session = await prisma.agentSession.findFirst({
    where: {
      id: sessionId,
      initiatorMembership: { userId, status: "active" },
      organization: { memberships: { some: { userId, status: "active" } } },
    },
    include: { localProject: true },
  })
  if (!session) return null
  const githubSource = githubSourceFromPolicy(session.policySnapshot)
  if (!githubSource) return null
  const project = session.localProject
  if (!project || project.status !== "active" || project.userId !== userId || project.organizationId !== session.organizationId) return null
  assertGithubSourceRepository(githubSource, project.repositoryFullName)
  const repo = await connectedGithubRepository(userId, githubSource.repositoryFullName)
  const github = await githubForUser(userId)
  if (path === undefined) {
    const { data: tree } = await github.rest.git.getTree({ owner: repo.owner, repo: repo.name, tree_sha: githubSource.sha, recursive: "true" })
    const paths = (tree.tree ?? []).flatMap((item) => item.type === "blob" && item.path && isReferenceFile(item.path) && (item.size ?? 0) <= MAX_FILE_BYTES ? [item.path] : [])
    return { paths: paths.slice(0, MAX_PROJECT_PATHS), truncated: Boolean(tree.truncated) || paths.length > MAX_PROJECT_PATHS, githubSource }
  }
  const { data } = await github.rest.repos.getContent({ owner: repo.owner, repo: repo.name, path, ref: githubSource.sha })
  if (Array.isArray(data) || data.type !== "file" || !("content" in data) || typeof data.content !== "string"
    || data.encoding !== "base64" || data.size > MAX_FILE_BYTES) throw new Error("Source file is not bounded text")
  const bytes = Buffer.from(data.content, "base64")
  if (bytes.byteLength > MAX_FILE_BYTES || bytes.includes(0)) throw new Error("Source file is not bounded text")
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  return { path, text, githubSource }
}

export async function githubForUser(userId: string) {
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

export async function connectedGithubRepository(userId: string, fullName: string) {
  const repo = await prisma.repository.findFirst({
    where: { userId, fullName: { equals: fullName, mode: "insensitive" } },
    select: { owner: true, name: true, fullName: true },
  })
  if (!repo) throw new Error("Repository is not connected to your account")
  return repo
}

export async function listGithubBranches(userId: string, fullName: string) {
  const repo = await connectedGithubRepository(userId, fullName)
  const github = await githubForUser(userId)
  const { data: remote } = await github.rest.repos.get({ owner: repo.owner, repo: repo.name })
  const defaultBranch = remote.default_branch
  const branches: Array<{ name: string; sha: string; isDefault: boolean }> = []
  let truncated = false
  for (let page = 1; page <= 10; page++) {
    const response = await github.rest.repos.listBranches({ owner: repo.owner, repo: repo.name, per_page: 100, page })
    branches.push(...response.data.map((branch) => ({ name: branch.name, sha: branch.commit.sha, isDefault: branch.name === defaultBranch })))
    const hasNext = /rel="next"/.test(response.headers.link ?? "")
    if (!hasNext) break
    if (page === 10) truncated = true
  }
  return { branches, defaultBranch, truncated }
}

export async function resolveGithubSource(userId: string, fullName: string, branch?: string) {
  const repo = await connectedGithubRepository(userId, fullName)
  const github = await githubForUser(userId)
  if (!branch) {
    const { data } = await github.rest.repos.get({ owner: repo.owner, repo: repo.name })
    branch = data.default_branch
  }
  const { data } = await github.rest.repos.getBranch({ owner: repo.owner, repo: repo.name, branch })
  const { githubSourceSchema } = await import("./github-source")
  return githubSourceSchema.parse({ repositoryFullName: repo.fullName, branch: data.name, sha: data.commit.sha })
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

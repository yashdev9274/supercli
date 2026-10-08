import prisma from "@super/db"

import {
  MAX_PROJECT_PATHS,
  type LocalProjectSummary,
  type upsertLocalProjectSchema,
  type updateLocalProjectSchema,
} from "@/modules/nova/local-projects/contracts"
import type { z } from "zod"

async function ensureOrg(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { organizationId: true },
  })
  if (!user?.organizationId) throw new Error("An active Nova workspace is required")
  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId: user.organizationId, userId } },
    select: { status: true },
  })
  if (membership?.status !== "active") throw new Error("An active Nova workspace membership is required")
  return user.organizationId
}

function serialize(
  project: {
    id: string
    displayName: string
    rootName: string
    fileCount: number
    truncated: boolean
    repositoryFullName: string | null
    status: string
    lastUsedAt: Date | null
    updatedAt: Date
    pathIndex?: unknown
  },
  includePaths = false,
): LocalProjectSummary {
  const paths = Array.isArray(project.pathIndex)
    ? project.pathIndex.filter((item): item is string => typeof item === "string")
    : []
  return {
    id: project.id,
    displayName: project.displayName,
    rootName: project.rootName,
    fileCount: project.fileCount,
    truncated: project.truncated,
    repositoryFullName: project.repositoryFullName,
    status: project.status,
    lastUsedAt: project.lastUsedAt?.toISOString() ?? null,
    updatedAt: project.updatedAt.toISOString(),
    ...(includePaths ? { paths } : {}),
  }
}

function normalizePaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of paths) {
    const path = raw.replaceAll("\\", "/").replace(/^\/+/, "").trim()
    if (!path || path.includes("..") || seen.has(path)) continue
    seen.add(path)
    out.push(path)
    if (out.length >= MAX_PROJECT_PATHS) break
  }
  return out
}

export async function listLocalProjects(userId: string): Promise<LocalProjectSummary[]> {
  const organizationId = await ensureOrg(userId)
  const projects = await prisma.webLocalProject.findMany({
    where: { userId, organizationId, status: "active" },
    orderBy: [{ lastUsedAt: "desc" }, { updatedAt: "desc" }],
    take: 50,
  })
  return projects.map((project) => serialize(project))
}

export async function getLocalProject(userId: string, projectId: string, includePaths = true) {
  const organizationId = await ensureOrg(userId)
  const project = await prisma.webLocalProject.findFirst({
    where: { id: projectId, userId, organizationId, status: { not: "archived" } },
  })
  return project ? serialize(project, includePaths) : null
}

export async function createLocalProject(
  userId: string,
  input: z.infer<typeof upsertLocalProjectSchema>,
): Promise<LocalProjectSummary> {
  const organizationId = await ensureOrg(userId)
  const paths = normalizePaths(input.paths)
  const project = await prisma.webLocalProject.create({
    data: {
      organizationId,
      userId,
      displayName: input.displayName,
      rootName: input.rootName,
      pathIndex: paths,
      fileCount: paths.length,
      truncated: Boolean(input.truncated) || input.paths.length > paths.length,
      repositoryFullName: input.repositoryFullName ?? null,
      lastUsedAt: new Date(),
    },
  })
  return serialize(project, true)
}

export async function updateLocalProject(
  userId: string,
  projectId: string,
  input: z.infer<typeof updateLocalProjectSchema>,
): Promise<LocalProjectSummary | null> {
  const organizationId = await ensureOrg(userId)
  const existing = await prisma.webLocalProject.findFirst({
    where: { id: projectId, userId, organizationId },
    select: { id: true },
  })
  if (!existing) return null

  const data: Record<string, unknown> = { lastUsedAt: new Date() }
  if (input.displayName) data.displayName = input.displayName
  if (input.status) data.status = input.status
  if (input.repositoryFullName !== undefined) data.repositoryFullName = input.repositoryFullName
  if (input.paths) {
    const paths = normalizePaths(input.paths)
    data.pathIndex = paths
    data.fileCount = paths.length
    data.truncated = Boolean(input.truncated) || input.paths.length > paths.length
  } else if (input.truncated !== undefined) {
    data.truncated = input.truncated
  }

  const project = await prisma.webLocalProject.update({
    where: { id: projectId },
    data,
  })
  return serialize(project, true)
}

export async function touchLocalProject(userId: string, projectId: string) {
  const organizationId = await ensureOrg(userId)
  await prisma.webLocalProject.updateMany({
    where: { id: projectId, userId, organizationId },
    data: { lastUsedAt: new Date() },
  })
}

export async function bindSessionLocalProject(
  userId: string,
  sessionId: string,
  projectId: string | null,
): Promise<{ sessionId: string; localProjectId: string | null; project: LocalProjectSummary | null } | null> {
  const organizationId = await ensureOrg(userId)
  const session = await prisma.agentSession.findFirst({
    where: { id: sessionId, organizationId },
    select: { id: true },
  })
  if (!session) return null

  if (projectId) {
    const project = await prisma.webLocalProject.findFirst({
      where: { id: projectId, userId, organizationId, status: "active" },
    })
    if (!project) throw new Error("Local project not found")
    await prisma.agentSession.update({
      where: { id: sessionId },
      data: { localProjectId: project.id },
    })
    await prisma.webLocalProject.update({
      where: { id: project.id },
      data: { lastUsedAt: new Date() },
    })
    return { sessionId, localProjectId: project.id, project: serialize(project, true) }
  }

  await prisma.agentSession.update({
    where: { id: sessionId },
    data: { localProjectId: null },
  })
  return { sessionId, localProjectId: null, project: null }
}

export async function getSessionLocalProject(userId: string, sessionId: string) {
  const organizationId = await ensureOrg(userId)
  const session = await prisma.agentSession.findFirst({
    where: { id: sessionId, organizationId },
    select: {
      localProjectId: true,
      localProject: true,
    },
  })
  if (!session) return null
  return session.localProject ? serialize(session.localProject, true) : null
}

export function formatLocalProjectContext(project: LocalProjectSummary): string {
  const paths = project.paths ?? []
  const sample = paths.slice(0, 200)
  const more = paths.length > sample.length ? `\n…and ${paths.length - sample.length} more paths` : ""
  return [
    "The user is working on a local project folder granted to Nova web (browser File System Access).",
    `Project: ${project.displayName} (root folder “${project.rootName}”).`,
    project.repositoryFullName ? `Linked repository hint: ${project.repositoryFullName}.` : null,
    `${project.fileCount} indexed path${project.fileCount === 1 ? "" : "s"}${project.truncated ? " (index truncated)" : ""}.`,
    "You cannot freely read disk paths. Prefer files the user @-mentions or attaches; ask them to open/attach others.",
    "Indexed relative paths:",
    "<nova_local_project_paths>",
    sample.join("\n") + more,
    "</nova_local_project_paths>",
  ].filter(Boolean).join("\n")
}

export function searchProjectPaths(
  project: LocalProjectSummary,
  query: string,
  limit = 40,
): Array<{ path: string; label: string; description: string }> {
  const paths = project.paths ?? []
  const q = query.trim().toLowerCase()
  const matched = q
    ? paths.filter((path) => path.toLowerCase().includes(q) || path.split("/").pop()?.toLowerCase().includes(q))
    : paths
  return matched.slice(0, limit).map((path) => ({
    path,
    label: path,
    description: `Local · ${project.displayName}`,
  }))
}

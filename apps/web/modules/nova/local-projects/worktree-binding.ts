import prisma from "@super/db"
import { z } from "zod"

import { Prisma } from "../../../../../packages/db/src/generated"

const opaqueIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/)

export const localWorktreeBindingSchema = z.object({
  workspaceId: opaqueIdSchema,
  projectId: opaqueIdSchema,
  sourceRef: z.string().max(512).refine(value => value === "" || (
    !value.startsWith("/") && !value.startsWith("-") && !value.endsWith("/")
    && !/[\s\\~^:?*\[\x00-\x1f\x7f]/.test(value)
    && !value.includes("..") && !value.includes("@{") && !value.includes("//")
    && !value.split("/").some(part => part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock"))
  )),
  baseSha: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})?$/),
  mode: z.enum(["current", "worktree"]),
}).strict().refine(value => value.mode === "current" || (value.baseSha !== "" && value.sourceRef !== ""), {
  message: "A worktree requires a source ref and base commit",
})

export const bindLocalWorktreeSchema = z.object({ binding: localWorktreeBindingSchema }).strict()
export type LocalWorktreeBinding = z.infer<typeof localWorktreeBindingSchema>

export class LocalWorktreeBindingError extends Error {
  constructor(message: string, public readonly status: 404 | 409) {
    super(message)
  }
}

export function sameLocalWorktreeBinding(left: LocalWorktreeBinding, right: LocalWorktreeBinding): boolean {
  return left.workspaceId === right.workspaceId && left.projectId === right.projectId
    && left.sourceRef === right.sourceRef && left.baseSha === right.baseSha && left.mode === right.mode
}

export function isLocalWorktreeRequestOrigin(request: Request): boolean {
  const url = new URL(request.url)
  const host = (request.headers.get("x-forwarded-host")?.split(",")[0]
    ?? request.headers.get("host") ?? url.host).trim().toLowerCase()
  const publicOrigins: Record<string, string> = {
    "nova.supercodeai.tech": "https://nova.supercodeai.tech",
    "nova.localhost:3000": "http://nova.localhost:3000",
    "nova.localhost:3003": "http://nova.localhost:3003",
  }
  const expected = publicOrigins[host] ?? (host === url.host ? url.origin : null)
  return expected !== null && request.headers.get("origin") === expected
}

type BindingRepository = Pick<typeof prisma, "agentSession">

export function createLocalWorktreeBindingService(repository: BindingRepository) {
  const ownedWhere = (userId: string, sessionId: string) => ({
    id: sessionId,
    initiatorMembership: { userId, status: "active" },
    organization: { memberships: { some: { userId, status: "active" } } },
  })

  async function read(userId: string, sessionId: string) {
    const session = await repository.agentSession.findFirst({
      where: ownedWhere(userId, sessionId),
      select: { localWorkspaceBinding: true, activeRunId: true, parentSessionId: true },
    })
    if (!session) throw new LocalWorktreeBindingError("Session not found", 404)
    return session
  }

  async function getLocalWorktreeBinding(userId: string, sessionId: string): Promise<LocalWorktreeBinding | null> {
    const session = await read(userId, sessionId)
    return session.localWorkspaceBinding === null ? null : localWorktreeBindingSchema.parse(session.localWorkspaceBinding)
  }

  async function bindLocalWorktree(userId: string, sessionId: string, input: LocalWorktreeBinding): Promise<LocalWorktreeBinding> {
    const binding = localWorktreeBindingSchema.parse(input)
    const session = await read(userId, sessionId)
    if (session.parentSessionId) throw new LocalWorktreeBindingError("Side threads cannot bind a local workspace", 409)
    if (session.localWorkspaceBinding !== null) {
      const existing = localWorktreeBindingSchema.parse(session.localWorkspaceBinding)
      if (sameLocalWorktreeBinding(existing, binding)) return existing
      throw new LocalWorktreeBindingError("Session is already bound to a different local workspace", 409)
    }
    if (session.activeRunId) throw new LocalWorktreeBindingError("Cannot bind a local workspace while a run is active", 409)
    const result = await repository.agentSession.updateMany({
      where: { ...ownedWhere(userId, sessionId), localWorkspaceBinding: { equals: Prisma.DbNull }, activeRunId: null, parentSessionId: null },
      data: { localWorkspaceBinding: binding },
    })
    if (result.count === 1) return binding
    const existing = await getLocalWorktreeBinding(userId, sessionId)
    if (existing && sameLocalWorktreeBinding(existing, binding)) return existing
    throw new LocalWorktreeBindingError("Session changed while binding the local workspace; reload before continuing", 409)
  }

  return { getLocalWorktreeBinding, bindLocalWorktree }
}

export const { getLocalWorktreeBinding, bindLocalWorktree } = createLocalWorktreeBindingService(prisma)

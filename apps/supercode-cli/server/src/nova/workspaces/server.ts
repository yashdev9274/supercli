import { randomBytes, timingSafeEqual } from "node:crypto"
import { isAbsolute } from "node:path"
import { z } from "zod"
import { NovaWorkspaceGit } from "./git"

const MAX_BODY = 2 * 1024 * 1024
const SESSION_MS = 60 * 60 * 1000
const SAFE_WORKSPACE_ERRORS = new Set([
  "Git worktree listing exceeds discovery limits",
  "Workspace registry exceeds discovery limits",
  "Invalid Git worktree listing",
  "Project root or ancestors cannot be symlinks",
  "Use a GitHub repository name in owner/name format",
  "Another repository clone is in progress",
  "Managed clone destination already exists; no files were overwritten",
  "GitHub clone failed; check this computer's Git credentials and repository access",
  "Managed clone is no longer a Git repository",
  "Narrow the .worktreeinclude file before copying ignored files",
  "Ignored-file copy exceeds 100 files or 20 MiB; narrow .worktreeinclude",
  "Index changed after commit; unstage new changes before resuming publication",
  "PR publishing requires a GitHub remote",
  "Unknown project",
  "Invalid thread ID",
  "Initialize this project explicitly first",
  "Repository is busy; retry after the other operation completes",
  "Finish the in-progress Git operation first",
  "Thread already bound to a different workspace",
  "Select a listed branch",
  "Select a listed branch; worktrees require a commit",
  "Starting branch disappeared",
  "New branch already exists; choose another name",
  "Workspace Git linkage changed; restore the original worktree",
  "Workspace root or ancestors cannot be symlinks",
  "Publishing remote changed; push refused",
  "Publishing remote changed; PR creation refused",
  "Remote branch changed; PR creation refused",
  "Unsafe file path",
  "Symlink root is forbidden",
  "Symlink paths are forbidden",
  "File is not readable",
  "Ignored files cannot be edited",
  "Only small text files can be edited",
  "Invalid branch",
  "Select a configured remote",
  "Publishing requires exactly one push URL",
  "Protected publishing branch; choose a new feature branch",
  "Branch is checked out; choose a new feature branch",
  "Publishing branch already exists at a different commit; push it without selecting more files",
  "Cannot publish to the remote default branch",
  "Select files and supply a commit message",
  "Supply a PR title",
  "There is no commit to publish",
  "Select only changed, non-ignored text files",
  "Unstage existing changes before publishing; unrelated staging is never consumed",
  "Preview expired; create a new preview",
  "Preview is stale; review a new preview",
  "Publishing branch is now checked out",
  "Workspace HEAD changed; publication stopped",
  "Publishing branch changed; commit preserved",
  "Publishing branch changed; push refused",
  "Remote changed; commit preserved, push refused",
  "PR result uncertain; inspect the provider before retrying with a new preview",
  "PR result uncertain; inspect GitHub before retrying with a new preview",
  "PR creation returned no URL; inspect GitHub before retrying",
])
const id = z.string().min(1).max(1024)
const workspaceInput = z.object({ workspaceId: id }).strict()
const projectInput = z.object({ projectId: id }).strict()
const createInput = z.object({
  projectId: id,
  threadId: id,
  sourceRef: z.string().max(1024),
  mode: z.enum(["worktree", "current"]),
  newBranch: id.optional(),
  copyIgnored: z.boolean().optional(),
}).strict()
const previewInput = z.object({
  workspaceId: id,
  action: z.enum(["commit", "push", "pr"]),
  branch: id,
  baseBranch: z.string().max(1024),
  remote: id,
  message: z.string().max(10000),
  files: z.array(id).max(10000),
  title: z.string().max(10000).optional(),
  body: z.string().max(100000).optional(),
}).strict()

export type CreateWorkspaceInput = z.infer<typeof createInput>
export type PreviewWorkspaceInput = z.infer<typeof previewInput>

export interface WorkspaceService {
  listProjects(): Promise<unknown>
  cloneRepository(repositoryFullName: string): Promise<unknown>
  lookup(threadId: string): Promise<unknown>
  branches(projectId: string): Promise<unknown>
  worktrees(projectId: string): Promise<unknown>
  fetchBranches(projectId: string): Promise<unknown>
  ignoredFiles(projectId: string): Promise<unknown>
  create(input: CreateWorkspaceInput): Promise<unknown>
  get(workspaceId: string): Promise<unknown>
  files(workspaceId: string): Promise<unknown>
  read(workspaceId: string, path: string): Promise<unknown>
  write(workspaceId: string, path: string, content: string): Promise<unknown>
  status(workspaceId: string): Promise<unknown>
  preview(input: PreviewWorkspaceInput): Promise<unknown>
  publish(input: { previewId: string }): Promise<unknown>
  initialize(projectId: string): Promise<unknown>
}

export function approvedWorkspaceOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return url.origin === value && !url.username && !url.password && !url.hostname.includes("*")
      && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
  } catch {
    return false
  }
}

function secret(bytes: number): string {
  return randomBytes(bytes).toString("base64url")
}

function equalSecret(actual: string, expected: string): boolean {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") throw new Error("input")
  const length = request.headers.get("content-length")
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY)) throw new Error("input")
  const reader = request.body?.getReader()
  if (!reader) throw new Error("input")
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY) {
      await reader.cancel()
      throw new Error("input")
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body))
}

export function startWorkspaceCompanion(options: {
  roots: string[]
  origins: string[]
  port?: number
  home?: string
  service?: WorkspaceService
}) {
  if (!options.roots.length || options.roots.some(root => !isAbsolute(root))) throw new Error("Explicit absolute project roots are required")
  if (!options.origins.length || options.origins.some(origin => !approvedWorkspaceOrigin(origin))) throw new Error("Explicit exact HTTP loopback or HTTPS origins are required")
  const port = options.port ?? 47832
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid port")
  const origins = new Set(options.origins)
  const service: WorkspaceService = options.service ?? new NovaWorkspaceGit({ roots: options.roots, home: options.home })
  const code = secret(18)
  let codeUsed = false
  let attempts = 0
  let windowStart = Date.now()
  const sessions = new Map<string, { origin: string; expiresAt: number }>()
  let boundPort = port
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    async fetch(request) {
      const origin = request.headers.get("origin")
      const cors = origin !== null && origins.has(origin)
      const headers = new Headers({ "Cache-Control": "no-store", "Vary": "Origin", "Content-Type": "application/json", "X-Content-Type-Options": "nosniff" })
      if (cors) headers.set("Access-Control-Allow-Origin", origin)
      const reply = (body: unknown, status = 200) => Response.json(body, { status, headers })
      const url = new URL(request.url)
      if (request.headers.get("host") !== `127.0.0.1:${boundPort}` || url.host !== `127.0.0.1:${boundPort}`) return reply({ error: "Forbidden host" }, 403)
      if (!cors) return reply({ error: "Forbidden origin" }, 403)
      if (request.method === "OPTIONS") {
        const requestedHeaders = (request.headers.get("access-control-request-headers") ?? "").split(",").map(value => value.trim().toLowerCase()).filter(Boolean)
        if (request.headers.get("access-control-request-method") !== "POST" || requestedHeaders.some(value => !["authorization", "content-type"].includes(value))) return reply({ error: "Forbidden preflight" }, 403)
        headers.set("Access-Control-Allow-Methods", "POST")
        headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type")
        if (request.headers.get("access-control-request-private-network") === "true") headers.set("Access-Control-Allow-Private-Network", "true")
        return new Response(null, { status: 204, headers })
      }
      if (request.method !== "POST") return reply({ error: "POST required" }, 400)
      if (url.pathname !== "/pair") {
        const authorization = request.headers.get("authorization") ?? ""
        const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : ""
        const session = sessions.get(token)
        if (!session || session.expiresAt <= Date.now()) {
          sessions.delete(token)
          return reply({ error: "Unauthorized" }, 401)
        }
        if (session.origin !== origin) return reply({ error: "Forbidden origin" }, 403)
      }
      let body: unknown
      try {
        body = await readBody(request)
      } catch {
        return reply({ error: "Invalid request" }, 400)
      }
      if (url.pathname === "/pair") {
        if (Date.now() - windowStart >= 60_000) {
          windowStart = Date.now()
          attempts = 0
        }
        if (attempts >= 5) return reply({ error: "Pairing temporarily unavailable" }, 401)
        const parsed = z.object({ code: z.string().max(256) }).strict().safeParse(body)
        if (!parsed.success) {
          attempts++
          return reply({ error: "Invalid request" }, 400)
        }
        if (codeUsed || !equalSecret(parsed.data.code, code)) {
          attempts++
          return reply({ error: "Invalid pairing code" }, 401)
        }
        codeUsed = true
        const token = secret(32)
        const expiresAt = Date.now() + SESSION_MS
        sessions.set(token, { origin, expiresAt })
        return reply({ token, expiresAt: new Date(expiresAt).toISOString() })
      }
      try {
        switch (url.pathname) {
          case "/projects": z.object({}).strict().parse(body); return reply({ projects: await service.listProjects() })
          case "/lookup": return reply({ workspace: await service.lookup(z.object({ threadId: id }).strict().parse(body).threadId) })
          case "/clone": {
            const input = z.object({
              repositoryFullName: z.string().max(256).regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/).refine(value => value.split("/").every(segment => segment !== "." && segment !== "..")),
              confirmed: z.literal(true),
            }).strict().parse(body)
            return reply({ project: await service.cloneRepository(input.repositoryFullName) })
          }
          case "/branches": {
            const input = projectInput.extend({ fetch: z.boolean().optional() }).strict().parse(body)
            return reply({ branches: input.fetch ? await service.fetchBranches(input.projectId) : await service.branches(input.projectId) })
          }
          case "/ignored-files": return reply({ paths: await service.ignoredFiles(projectInput.parse(body).projectId) })
          case "/worktrees": return reply({ worktrees: await service.worktrees(projectInput.parse(body).projectId) })
          case "/create": return reply({ workspace: await service.create(createInput.parse(body)) })
          case "/get": return reply({ workspace: await service.get(workspaceInput.parse(body).workspaceId) })
          case "/files": return reply({ paths: await service.files(workspaceInput.parse(body).workspaceId) })
          case "/read": {
            const input = workspaceInput.extend({ path: id }).strict().parse(body)
            return reply({ content: await service.read(input.workspaceId, input.path) })
          }
          case "/write": {
            const input = workspaceInput.extend({ path: id, content: z.string().max(MAX_BODY) }).strict().parse(body)
            await service.write(input.workspaceId, input.path, input.content)
            return reply({ ok: true })
          }
          case "/status": return reply({ status: await service.status(workspaceInput.parse(body).workspaceId) })
          case "/preview": return reply({ preview: await service.preview(previewInput.parse(body)) })
          case "/publish": return reply({ result: await service.publish(z.object({ previewId: id }).strict().parse(body)) })
          case "/initialize": {
            const input = projectInput.extend({ confirmed: z.literal(true) }).strict().parse(body)
            return reply({ project: await service.initialize(input.projectId) })
          }
          default: return reply({ error: "Invalid route" }, 400)
        }
      } catch (error) {
        if (error instanceof z.ZodError) return reply({ error: "Invalid request" }, 400)
        return reply({ error: error instanceof Error && SAFE_WORKSPACE_ERRORS.has(error.message) ? error.message : "Workspace operation failed" }, 409)
      }
    },
    error() {
      return Response.json({ error: "Invalid request" }, { status: 400, headers: { "Cache-Control": "no-store" } })
    },
  })
  boundPort = server.port!
  return { server, code, stop() { sessions.clear(); codeUsed = true; server.stop(true) } }
}

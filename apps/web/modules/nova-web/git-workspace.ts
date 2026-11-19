import { z } from "zod"

import type { LocalAttachment } from "@/modules/nova/attachments/contracts"
import {
  MAX_LOCAL_FILE_BYTES,
  MAX_LOCAL_TOTAL_BYTES,
} from "@/modules/nova/attachments/contracts"
import {
  rankProjectPaths,
  isLikelyTextProjectPath,
  MAX_PROJECT_PACK_FILES,
} from "@/modules/nova/local-projects/rank-paths"
import type { FileProposalDto } from "./api"

export const gitProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  repositoryFullName: z.string().nullable(),
  isGit: z.boolean(),
})
export const gitBranchSchema = z.object({
  name: z.string(),
  ref: z.string(),
  sha: z.string(),
  remote: z.boolean(),
  checkedOut: z.boolean(),
  current: z.boolean(),
})
export const gitWorkspaceSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  threadId: z.string(),
  path: z.string(),
  sourceRef: z.string(),
  baseSha: z.string(),
  branch: z.string().nullable(),
  mode: z.enum(["current", "worktree"]),
})
export type GitProject = z.infer<typeof gitProjectSchema>
export type GitBranch = z.infer<typeof gitBranchSchema>
export type GitWorkspace = z.infer<typeof gitWorkspaceSchema>
export type WorkspaceChoice = {
  projectId: string
  mode: "current" | "worktree"
  sourceRef: string
  newBranch?: string
  copyIgnored: boolean
}
export type PublishInput = {
  workspaceId: string
  action: "commit" | "push" | "pr"
  branch: string
  baseBranch: string
  remote: string
  message: string
  files: string[]
  title?: string
  body?: string
}
export type PublishPreview = PublishInput & {
  id: string
  head: string
  diff: string
  expiresAt: string
}
export type GitStatus = {
  head: string
  branch: string | null
  files: Array<{ path: string; status: string }>
  diff: string
}
export type PublishResult = {
  commitSha: string
  branch: string
  prUrl?: string
}

type Pairing = { port: number; token: string; expiresAt: string }

export function workspacePublishIntent(
  content: string,
): PublishInput["action"] | null {
  const text = content.trim().replace(/^please\s+/i, "")
  if (
    !/^(?:commit\b|push\b|(?:create|open)\s+(?:a\s+)?(?:pr|pull request)\b)/i.test(
      text,
    )
  )
    return null
  if (/\bpr\b|pull request/i.test(text)) return "pr"
  if (/\bpush\b/i.test(text)) return "push"
  return "commit"
}

export class GitWorkspaceClient {
  private pairing: Pairing | null = null

  constructor(
    private readonly userId: string,
    private readonly fetcher: (
      url: string,
      init?: RequestInit,
    ) => Promise<Response> = (url, init) => fetch(url, init),
  ) {
    try {
      const saved = z
        .object({
          port: z.number().int().min(1024).max(65535),
          token: z.string().min(32),
          expiresAt: z.string(),
        })
        .parse(JSON.parse(sessionStorage.getItem(this.key) ?? "null"))
      if (Date.parse(saved.expiresAt) > Date.now()) this.pairing = saved
    } catch {}
  }

  private get key() {
    return `nova:git-pairing:${this.userId}`
  }
  get connected() {
    return Boolean(
      this.pairing && Date.parse(this.pairing.expiresAt) > Date.now(),
    )
  }

  async pair(port: number, code: string) {
    if (!Number.isInteger(port) || port < 1024 || port > 65535)
      throw new Error("Choose a valid companion port")
    const response = await this.fetcher(`http://127.0.0.1:${port}/pair`, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!response.ok)
      throw new Error(
        "Pairing failed. Check the code and approved Nova origin in the companion terminal.",
      )
    const result = z
      .object({ token: z.string().min(32), expiresAt: z.string() })
      .parse(await response.json())
    if (!(Date.parse(result.expiresAt) > Date.now()))
      throw new Error("Pairing expired")
    this.pairing = { port, ...result }
    try {
      sessionStorage.setItem(this.key, JSON.stringify(this.pairing))
    } catch {}
  }

  disconnect() {
    this.pairing = null
    try {
      sessionStorage.removeItem(this.key)
    } catch {}
  }

  savedWorkspaces(): GitWorkspace[] {
    const workspaces: GitWorkspace[] = []
    try {
      const prefix = `nova:git-thread:${this.userId}:`
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index)
        if (!key?.startsWith(prefix)) continue
        try {
          const parsed = gitWorkspaceSchema.safeParse(JSON.parse(localStorage.getItem(key) ?? "null"))
          if (parsed.success && key === `${prefix}${parsed.data.threadId}`) workspaces.push(parsed.data)
        } catch {}
      }
    } catch {}
    return workspaces
  }

  async request<T>(path: string, input: unknown): Promise<T> {
    if (!this.connected || !this.pairing)
      throw new Error(
        "Pair the local workspace companion before continuing. Your worktree has not been changed.",
      )
    const response = await this.fetcher(
      `http://127.0.0.1:${this.pairing.port}${path}`,
      {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        redirect: "error",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.pairing.token}`,
        },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(
          path === "/publish" || path === "/create" ? 120_000 : 30_000,
        ),
      },
    ).catch(() => {
      throw new Error(
        "Local workspace companion is unavailable. Reconnect it; Nova will not fall back to your original checkout.",
      )
    })
    const payload = await response.json()
    if (response.status === 401) this.disconnect()
    if (!response.ok)
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : "Local workspace request failed",
      )
    return payload as T
  }

  async projects() {
    const data = await this.request<{ projects: unknown }>("/projects", {})
    return z.array(gitProjectSchema).parse(data.projects)
  }
  async branches(projectId: string, refresh = false) {
    const data = await this.request<{ branches: unknown }>("/branches", {
      projectId,
      fetch: refresh,
    })
    return z.array(gitBranchSchema).parse(data.branches)
  }
  async clone(repositoryFullName: string) {
    const data = await this.request<{ project: unknown }>("/clone", { repositoryFullName, confirmed: true })
    return gitProjectSchema.parse(data.project)
  }
  async ignoredFiles(projectId: string) {
    return (await this.request<{ paths: string[] }>("/ignored-files", { projectId })).paths
  }
  async create(threadId: string, choice: WorkspaceChoice) {
    const data = await this.request<{ workspace: unknown }>("/create", {
      ...choice,
      threadId,
    })
    return gitWorkspaceSchema.parse(data.workspace)
  }
  async get(workspaceId: string) {
    const data = await this.request<{ workspace: unknown }>("/get", {
      workspaceId,
    })
    return gitWorkspaceSchema.parse(data.workspace)
  }
  async lookup(threadId: string) {
    const data = await this.request<{ workspace: unknown }>("/lookup", {
      threadId,
    })
    return data.workspace === null
      ? null
      : gitWorkspaceSchema.parse(data.workspace)
  }
  async files(workspaceId: string) {
    return (await this.request<{ paths: string[] }>("/files", { workspaceId }))
      .paths
  }
  async read(workspaceId: string, path: string) {
    return (
      await this.request<{ content: string }>("/read", { workspaceId, path })
    ).content
  }
  async status(workspaceId: string) {
    return (
      await this.request<{ status: GitStatus }>("/status", { workspaceId })
    ).status
  }
  async preview(input: PublishInput) {
    return (await this.request<{ preview: PublishPreview }>("/preview", input))
      .preview
  }
  async publish(previewId: string) {
    return (
      await this.request<{ result: PublishResult }>("/publish", { previewId })
    ).result
  }
  async initialize(projectId: string) {
    return (
      await this.request<{ project: GitProject }>("/initialize", {
        projectId,
        confirmed: true,
      })
    ).project
  }

  async pack(
    workspace: GitWorkspace,
    objective: string,
    existing: LocalAttachment[],
  ): Promise<LocalAttachment[]> {
    const paths = await this.files(workspace.id)
    const workspacePaths = new Set(paths)
    const selectedPaths = existing
      .filter((file) => workspacePaths.has(file.name))
      .map((file) => file.name)
    const ranked = rankProjectPaths(
      paths.filter(isLikelyTextProjectPath),
      objective,
      MAX_PROJECT_PACK_FILES,
    )
    const packed = existing.filter((file) => !workspacePaths.has(file.name))
    const seen = new Set(packed.map((file) => file.name))
    let bytes = packed.reduce((sum, file) => sum + file.size, 0)
    for (const path of [...selectedPaths, ...ranked.map((file) => file.path)]) {
      if (packed.length >= MAX_PROJECT_PACK_FILES) break
      if (seen.has(path)) continue
      const text = await this.read(workspace.id, path)
      const size = new TextEncoder().encode(text).byteLength
      if (
        !text.trim() ||
        text.length > 120_000 ||
        path.length > 200 ||
        size > MAX_LOCAL_FILE_BYTES ||
        bytes + size > MAX_LOCAL_TOTAL_BYTES
      )
        continue
      packed.push({
        id: `worktree:${crypto.randomUUID()}`,
        name: path,
        kind: "text",
        mediaType: "text/plain",
        size,
        text,
      })
      seen.add(path)
      bytes += size
    }
    return packed
  }

  async apply(workspace: GitWorkspace, proposals: FileProposalDto[]) {
    const results = []
    for (const proposal of proposals) {
      try {
        await this.request("/write", {
          workspaceId: workspace.id,
          path: proposal.path,
          content: proposal.content,
        })
        results.push({ path: proposal.path, ok: true })
      } catch (error) {
        results.push({
          path: proposal.path,
          ok: false,
          error:
            error instanceof Error ? error.message : "Could not apply file",
        })
      }
    }
    const applied = results.filter((result) => result.ok).length
    return {
      results,
      applied,
      failed: results.length - applied,
      neededGrant: false,
      message: `Applied ${applied}/${results.length} files to ${workspace.mode === "worktree" ? "the isolated worktree" : "the current checkout"}${results.some((result) => !result.ok) ? `: ${results.find((result) => !result.ok)?.error}` : ""}`,
    }
  }
}

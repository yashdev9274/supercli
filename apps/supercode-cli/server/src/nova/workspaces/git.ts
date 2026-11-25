import { execFile } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { promises as fs, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import { promisify } from "node:util"

const exec = promisify(execFile)
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex")
const locks = new Map<string, Promise<unknown>>()
function canonical(path: string): string {
  try { return realpathSync(path) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    return join(canonical(dirname(path)), basename(path))
  }
}
export type Project = { id: string; name: string; path: string; repositoryFullName: string | null; isGit: boolean }
export type Branch = { name: string; ref: string; sha: string; remote: boolean; checkedOut: boolean; current: boolean }
export type Worktree = { path: string; branch: string | null; head: string; main: boolean; locked: boolean; prunable: boolean; workspaceId?: string; threadId?: string }
const MAX_WORKTREES = 256
const MAX_WORKTREE_BYTES = 1024 * 1024

export function parseGitWorktrees(output: string): Worktree[] {
  const invalid = () => { throw new Error("Invalid Git worktree listing") }
  if (Buffer.byteLength(output) > MAX_WORKTREE_BYTES) throw new Error("Git worktree listing exceeds discovery limits")
  if (!output || !output.endsWith("\0\0")) return invalid()
  const result: Worktree[] = []
  const paths = new Set<string>()
  for (const block of output.slice(0, -2).split("\0\0")) {
    if (result.length >= MAX_WORKTREES) throw new Error("Git worktree listing exceeds discovery limits")
    const fields = block.split("\0")
    const first = fields.shift()!
    if (!first.startsWith("worktree ")) return invalid()
    const path = first.slice(9)
    if (!isAbsolute(path) || paths.has(path)) return invalid()
    paths.add(path)
    const values = new Map<string, string>()
    for (const field of fields) {
      const space = field.indexOf(" ")
      const key = space < 0 ? field : field.slice(0, space)
      const value = space < 0 ? "" : field.slice(space + 1)
      if (!["HEAD", "branch", "detached", "bare", "locked", "prunable"].includes(key) || values.has(key)) return invalid()
      if (["bare", "detached"].includes(key) && value) return invalid()
      values.set(key, value)
    }
    const head = values.get("HEAD") ?? ""
    const branch = values.get("branch")
    if (values.has("bare")) {
      if (head || branch !== undefined || values.has("detached")) return invalid()
    } else if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(head) || (branch === undefined) === !values.has("detached")) return invalid()
    if (branch !== undefined && (!branch.startsWith("refs/heads/") || branch.length <= 11 || /[\x00-\x20\x7f]/.test(branch))) return invalid()
    result.push({ path, branch: branch?.slice(11) ?? null, head, main: result.length === 0, locked: values.has("locked"), prunable: values.has("prunable") })
  }
  return result
}
export type Workspace = { id: string; projectId: string; threadId: string; path: string; sourceRef: string; baseSha: string; branch: string | null; mode: "current" | "worktree" }
export type PublishInput = { workspaceId: string; action: "commit" | "push" | "pr"; branch: string; baseBranch: string; remote: string; message: string; files: string[]; title?: string; body?: string }
export type Preview = PublishInput & { id: string; head: string; diff: string; expiresAt: string }
type StoredPreview = { preview: Preview; fingerprint: string; remoteHeads: string; indexTree?: string; receipt?: { commitSha: string; branch: string; prUrl?: string }; stage?: "committed" | "attached" | "pushed" | "pr-started" | "done" }
type PrPublisher = (input: { cwd: string; branch: string; baseBranch: string; remote: string; title: string; body: string }) => Promise<string>

async function run(cwd: string, args: string[], env?: NodeJS.ProcessEnv, input?: Buffer, timeout = 30_000, maxBuffer = 16 * 1024 * 1024) {
  const config = ["-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"]
  const environment = { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_LITERAL_PATHSPECS: args[0] === "check-ignore" ? "0" : "1", ...env }
  const filters = await exec("git", [...config, "-C", cwd, "config", "--name-only", "--get-regexp", "^filter\\."], { env: environment, timeout: 5000, maxBuffer: 1024 * 1024 }).then(result => result.stdout).catch(error => { if (error.code === 1) return ""; throw error })
  for (const key of filters.split("\n")) {
    const match = key.match(/^filter\.(.+)\.(?:clean|smudge|process|required)$/)
    if (match) for (const attribute of ["clean", "smudge", "process", "required"]) config.push("-c", "filter." + match[1] + "." + attribute + "=" + (attribute === "required" ? "false" : ""))
  }
  const pending = exec("git", [...config, "-C", cwd, ...args], { env: environment, timeout, maxBuffer })
  pending.child.stdin?.end(input)
  const result = await pending
  return result.stdout.replace(/\n$/, "")
}
async function optional(cwd: string, args: string[]) {
  try { return await run(cwd, args) } catch { return "" }
}
async function exists(path: string) {
  try { await fs.lstat(path); return true } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error }
}

export class NovaWorkspaceGit {
  private roots: string[]
  private registry: string
  private publishPr: PrPublisher
  private injectedPublisher: boolean
  private repositories: string

  constructor({ roots, home = homedir(), publishPr }: { roots: string[]; home?: string; publishPr?: PrPublisher }) {
    this.roots = [...new Set(roots.map(root => canonical(resolve(root))))]
    this.registry = join(canonical(resolve(home)), ".nova", "worktrees")
    this.repositories = join(canonical(resolve(home)), ".nova", "repositories")
    this.injectedPublisher = Boolean(publishPr)
    this.publishPr = publishPr ?? (async input => {
      const repository = await this.prRepository(input.cwd, input.remote)
      const result = await exec("gh", ["pr", "create", "--repo", repository, "--head", input.branch, "--base", input.baseBranch, "--title", input.title, "--body", input.body], { cwd: input.cwd, timeout: 30_000, maxBuffer: 1024 * 1024 })
      const url = result.stdout.trim()
      if (!/^https:\/\//.test(url)) throw new Error("PR creation returned no URL; inspect GitHub before retrying")
      return url
    })
  }

  private async save(name: string, value: unknown) {
    await fs.mkdir(this.registry, { recursive: true, mode: 0o700 })
    const destination = join(this.registry, name + ".json")
    const temporary = destination + "." + randomUUID()
    await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600, flag: "wx" })
    await fs.rename(temporary, destination)
  }

  private async load<T>(name: string): Promise<T> {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid registry ID")
    return JSON.parse(await fs.readFile(join(this.registry, name + ".json"), "utf8")) as T
  }

  async listProjects(): Promise<Project[]> {
    const managed = await this.managedRepositories()
    const roots = [...new Set([...this.roots, ...managed.map(name => join(this.repositories, hash(name.toLowerCase()).slice(0, 32)))])]
    return Promise.all(roots.map(async path => {
      const isGit = (await optional(path, ["rev-parse", "--is-inside-work-tree"])) === "true"
      const url = isGit ? await optional(path, ["remote", "get-url", "origin"]) : ""
      const match = url.match(/(?:github\.com[:/])([^/]+\/[^/]+?)(?:\.git)?$/)
      const managedName = managed.find(name => join(this.repositories, hash(name).slice(0, 32)) === path)
      return { id: hash(path).slice(0, 24), name: managedName?.split("/")[1] ?? basename(path), path, repositoryFullName: match?.[1] ?? managedName ?? null, isGit }
    }))
  }

  private repositoryName(name: string) {
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(name) || [".", ".."].includes(name.split("/")[1]!)) throw new Error("Use a GitHub repository name in owner/name format")
    return name.toLowerCase()
  }

  private async managedRepositories(): Promise<string[]> {
    if (!await exists(join(this.registry, "repositories.json"))) return []
    const names = await this.load<string[]>("repositories")
    if (!Array.isArray(names)) throw new Error("Invalid managed repository registry")
    return names.map(name => this.repositoryName(name))
  }

  async cloneRepository(repositoryFullName: string): Promise<Project> {
    const name = this.repositoryName(repositoryFullName)
    await fs.mkdir(this.registry, { recursive: true, mode: 0o700 })
    await fs.mkdir(this.repositories, { recursive: true, mode: 0o700 })
    if ((await fs.lstat(this.repositories)).isSymbolicLink()) throw new Error("Managed repository directory cannot be a symlink")
    const lock = join(this.registry, "clone.lock")
    await fs.mkdir(lock).catch(() => { throw new Error("Another repository clone is in progress") })
    const path = join(this.repositories, hash(name).slice(0, 32))
    const temporary = join(this.repositories, "clone-" + randomUUID())
    try {
      const names = await this.managedRepositories()
      if (!names.includes(name)) {
        if (await exists(path)) throw new Error("Managed clone destination already exists; no files were overwritten")
        try {
          await run(this.repositories, ["clone", "--", "https://github.com/" + name + ".git", temporary], undefined, undefined, 120_000)
        } catch { throw new Error("GitHub clone failed; check this computer's Git credentials and repository access") }
        await fs.rename(temporary, path)
        await this.save("repositories", [...names, name])
      }
      if ((await fs.lstat(path)).isSymbolicLink()) throw new Error("Managed clone cannot be a symlink")
      const project = (await this.listProjects()).find(project => project.path === path)
      if (!project?.isGit) throw new Error("Managed clone is no longer a Git repository")
      return project
    } finally {
      await fs.rm(temporary, { recursive: true, force: true })
      await fs.rmdir(lock)
    }
  }

  private async project(id: string) {
    const project = (await this.listProjects()).find(project => project.id === id)
    if (!project) throw new Error("Unknown project")
    return project
  }

  private async locked<T>(path: string, task: () => Promise<T>): Promise<T> {
    const common = resolve(path, await run(path, ["rev-parse", "--git-common-dir"]))
    const previous = locks.get(common) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(async () => {
      const lock = join(common, "nova-workspace.lock")
      await fs.mkdir(lock).catch(() => { throw new Error("Repository is busy; retry after the other operation completes") })
      try { await this.idle(path); return await task() } finally { await fs.rmdir(lock) }
    })
    locks.set(common, next)
    try { return await next } finally { if (locks.get(common) === next) locks.delete(common) }
  }

  private async idle(path: string) {
    for (const name of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "BISECT_LOG", "rebase-merge", "rebase-apply", "sequencer", "index.lock"]) {
      const location = await run(path, ["rev-parse", "--git-path", name])
      if (await exists(resolve(path, location))) throw new Error("Finish the in-progress Git operation first")
    }
  }

  async branches(projectId: string): Promise<Branch[]> {
    const project = await this.project(projectId)
    if (!project.isGit) return []
    const current = await optional(project.path, ["symbolic-ref", "-q", "HEAD"])
    const occupied = await run(project.path, ["worktree", "list", "--porcelain"])
    const refs = await run(project.path, ["for-each-ref", "--format=%(refname)%09%(objectname)%09%(symref)", "refs/heads", "refs/remotes"])
    return refs.split("\n").filter(Boolean).flatMap(line => {
      const [ref = "", sha = "", symref] = line.split("\t")
      if (symref) return []
      return [{ name: ref.replace(/^refs\/(heads|remotes)\//, ""), ref, sha, remote: ref.startsWith("refs/remotes/"), checkedOut: occupied.split("\n").includes("branch " + ref), current: ref === current }]
    })
  }

  async worktrees(projectId: string): Promise<Worktree[]> {
    const project = await this.project(projectId)
    if (!project.isGit) return []
    if (await fs.realpath(project.path) !== project.path) throw new Error("Project root or ancestors cannot be symlinks")
    let output: string
    try {
      output = await run(project.path, ["worktree", "list", "--porcelain", "-z"], undefined, undefined, 10_000, MAX_WORKTREE_BYTES)
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") throw new Error("Git worktree listing exceeds discovery limits")
      throw error
    }
    const worktrees = parseGitWorktrees(output)
    if (!await exists(this.registry)) return worktrees
    const directory = await fs.opendir(this.registry).catch(error => {
      if (error.code === "ENOENT") return null
      throw error
    })
    if (!directory) return worktrees
    let entries = 0
    const ambiguous = new Set<string>()
    for await (const entry of directory) {
      if (++entries > 1024) throw new Error("Workspace registry exceeds discovery limits")
      if (!entry.isFile() || !/^[0-9a-f]{32}\.json$/.test(entry.name)) continue
      const id = entry.name.slice(0, -5)
      const stat = await fs.lstat(join(this.registry, entry.name))
      if (!stat.isFile() || stat.size > 64 * 1024) continue
      let workspace: Workspace
      try {
        const manifest = await this.load<Workspace>(id)
        if (manifest.projectId !== projectId || !/^[a-zA-Z0-9_-]{1,128}$/.test(manifest.threadId) || hash(projectId + ":" + manifest.threadId).slice(0, 32) !== id) continue
        if (!["current", "worktree"].includes(manifest.mode)) continue
        const candidate = worktrees.find(tree => tree.path === manifest.path && !tree.prunable)
        if (!candidate) continue
        const bindingStat = await fs.lstat(join(this.registry, "binding-" + id + ".json"))
        if (!bindingStat.isFile() || bindingStat.size > 64 * 1024) continue
        const binding = await this.load<Workspace>("binding-" + id)
        if (binding.projectId !== projectId || binding.threadId !== manifest.threadId || binding.mode !== manifest.mode || binding.sourceRef !== manifest.sourceRef) continue
        workspace = await this.get(id)
      } catch {
        continue
      }
      const tree = worktrees.find(tree => tree.path === workspace.path)!
      if (ambiguous.has(tree.path)) continue
      if (tree.workspaceId) {
        ambiguous.add(tree.path)
        delete tree.workspaceId
        delete tree.threadId
        continue
      }
      tree.workspaceId = workspace.id
      tree.threadId = workspace.threadId
    }
    return worktrees
  }

  async fetchBranches(projectId: string): Promise<Branch[]> {
    const project = await this.project(projectId)
    if (!project.isGit) return []
    return this.locked(project.path, async () => {
      const remotes = (await run(project.path, ["remote"])).split("\n").filter(Boolean)
      if (remotes.length > 8) throw new Error("Too many remotes for a bounded branch refresh")
      for (const remote of remotes) {
        await this.remote(project.path, remote)
        await run(project.path, ["fetch", "--no-tags", "--", remote])
      }
      return this.branches(projectId)
    })
  }

  async initialize(projectId: string) {
    const project = await this.project(projectId)
    if (!project.isGit) await run(project.path, ["init"])
    return (await this.project(projectId))
  }

  async create(input: { projectId: string; threadId: string; sourceRef: string; mode: "worktree" | "current"; newBranch?: string; copyIgnored?: boolean }): Promise<Workspace> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(input.threadId)) throw new Error("Invalid thread ID")
    if (!["current", "worktree"].includes(input.mode)) throw new Error("Invalid workspace mode")
    const project = await this.project(input.projectId)
    if (!project.isGit) throw new Error("Initialize this project explicitly first")
    if (await fs.realpath(project.path) !== project.path) throw new Error("Project root or ancestors cannot be symlinks")
    return this.locked(project.path, async () => {
      const id = hash(input.projectId + ":" + input.threadId).slice(0, 32)
      if (await exists(join(this.registry, id + ".json"))) {
        const existing = await this.get(id)
        const binding = await this.load<{ sourceRef: string; newBranch?: string; mode: string }>("binding-" + id)
        if (binding.sourceRef !== input.sourceRef || binding.mode !== input.mode || binding.newBranch !== input.newBranch) throw new Error("Thread already bound to a different workspace")
        return existing
      }
      if (input.newBranch) await this.validBranch(project.path, input.newBranch)
      let branch = (await this.branches(input.projectId)).find(branch => branch.ref === input.sourceRef || branch.name === input.sourceRef)
      if (!branch && input.sourceRef && await optional(project.path, ["rev-parse", "--verify", "HEAD"])) throw new Error("Select a listed branch")
      if (input.mode === "worktree" && !branch) throw new Error("Select a listed branch; worktrees require a commit")
      if (branch?.remote && input.mode === "worktree") {
        const remote = branch.name.split("/")[0]!
        await this.remote(project.path, remote)
        await run(project.path, ["fetch", "--no-tags", "--", remote])
        branch = (await this.branches(input.projectId)).find(value => value.ref === branch!.ref)
        if (!branch) throw new Error("Starting branch disappeared")
      }
      const baseSha = input.mode === "current" ? await optional(project.path, ["rev-parse", "--verify", "HEAD"]) : branch!.sha
      const path = input.mode === "current" ? project.path : join(this.registry, "trees", id)
      if (input.mode === "worktree") {
        if (input.copyIgnored) await this.ignoredCandidates(project.path)
        await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 })
        if (input.newBranch) {
          if (await optional(project.path, ["rev-parse", "--verify", "refs/heads/" + input.newBranch])) throw new Error("New branch already exists; choose another name")
          await run(project.path, ["worktree", "add", "-b", input.newBranch, "--", path, baseSha])
        } else await run(project.path, ["worktree", "add", "--detach", "--", path, baseSha])
        if (input.copyIgnored) await this.copyIgnored(project.path, path)
      }
      const workspace: Workspace = { id, projectId: project.id, threadId: input.threadId, path, sourceRef: input.sourceRef, baseSha, branch: await optional(path, ["symbolic-ref", "--short", "-q", "HEAD"]) || null, mode: input.mode }
      await this.save("binding-" + id, { ...input, gitDir: await fs.realpath(resolve(path, await run(path, ["rev-parse", "--git-dir"]))), commonDir: await fs.realpath(resolve(project.path, await run(project.path, ["rev-parse", "--git-common-dir"]))) })
      await this.save(id, workspace)
      return workspace
    })
  }

  async get(workspaceId: string): Promise<Workspace> {
    const workspace = await this.load<Workspace>(workspaceId)
    const project = await this.project(workspace.projectId)
    const expected = workspace.mode === "current" ? project.path : join(this.registry, "trees", workspace.id)
    if (workspace.id !== workspaceId || workspace.path !== expected) throw new Error("Invalid workspace manifest")
    if (await fs.realpath(workspace.path) !== resolve(workspace.path) || await fs.realpath(project.path) !== resolve(project.path)) throw new Error("Workspace root or ancestors cannot be symlinks")
    const binding = await this.load<{ gitDir: string; commonDir: string }>("binding-" + workspaceId)
    const common = await fs.realpath(resolve(workspace.path, await run(workspace.path, ["rev-parse", "--git-common-dir"])))
    const projectCommon = await fs.realpath(resolve(project.path, await run(project.path, ["rev-parse", "--git-common-dir"])))
    const gitDir = await fs.realpath(resolve(workspace.path, await run(workspace.path, ["rev-parse", "--git-dir"])))
    const toplevel = await run(workspace.path, ["rev-parse", "--show-toplevel"])
    if (common !== projectCommon || common !== binding.commonDir || gitDir !== binding.gitDir || await fs.realpath(toplevel) !== workspace.path) throw new Error("Workspace Git linkage changed; restore the original worktree")
    if (workspace.baseSha) await run(workspace.path, ["cat-file", "-e", workspace.baseSha + "^{commit}"])
    return workspace
  }

  async lookup(threadId: string): Promise<Workspace | null> {
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(threadId)) throw new Error("Invalid thread ID")
    const matches: Workspace[] = []
    for (const project of await this.listProjects()) {
      const id = hash(project.id + ":" + threadId).slice(0, 32)
      if (!await exists(join(this.registry, id + ".json"))) continue
      const workspace = await this.get(id)
      if (workspace.threadId !== threadId || workspace.projectId !== project.id) throw new Error("Invalid thread binding")
      matches.push(workspace)
    }
    if (matches.length > 1) throw new Error("Thread has multiple project bindings; choose a workspace explicitly")
    return matches[0] ?? null
  }

  private async safe(path: string, file: string) {
    if (!file || isAbsolute(file) || file.includes("\\") || file.includes("\0") || file.split("/").some(part => !part || part === "." || part === ".." || part.toLowerCase() === ".git")) throw new Error("Unsafe file path")
    let current = path
    if ((await fs.lstat(current)).isSymbolicLink()) throw new Error("Symlink root is forbidden")
    for (const part of file.split("/")) {
      current = join(current, part)
      if (await exists(current) && (await fs.lstat(current)).isSymbolicLink()) throw new Error("Symlink paths are forbidden")
    }
    return current
  }

  private async ignored(path: string, file: string) {
    if (basename(file) === ".env.example") return false
    if (/^\.env(?:\.|$)/.test(basename(file))) return true
    return this.gitIgnored(path, file)
  }

  private async gitIgnored(path: string, file: string) {
    try { await run(path, ["check-ignore", "--no-index", "-q", "--", file]); return true } catch (error) {
      if ((error as { code?: number }).code === 1) return false
      throw error
    }
  }

  async files(workspaceId: string): Promise<string[]> {
    const workspace = await this.get(workspaceId)
    return this.workspaceFiles(workspace)
  }

  private async workspaceFiles(workspace: Workspace): Promise<string[]> {
    const candidates = await run(workspace.path, ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    const examples = (await run(workspace.path, ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"])).split("\0").filter(file => basename(file) === ".env.example").join("\0")
    const result: string[] = []
    for (const file of new Set((candidates + "\0" + examples).split("\0").filter(Boolean))) {
      try {
        const path = await this.safe(workspace.path, file)
        if (await this.ignored(workspace.path, file)) continue
        const stat = await fs.stat(path)
        if (!stat.isFile() || stat.size > 2 * 1024 * 1024) continue
        const data = await fs.readFile(path)
        if (data.includes(0)) continue
        new TextDecoder("utf-8", { fatal: true }).decode(data)
        result.push(file)
      } catch { continue }
    }
    return result.sort()
  }

  async read(workspaceId: string, file: string) {
    const workspace = await this.get(workspaceId)
    return this.readFile(workspace, file)
  }

  private async readFile(workspace: Workspace, file: string) {
    const path = await this.safe(workspace.path, file)
    if (await this.ignored(workspace.path, file)) throw new Error("File is not readable")
    const stat = await fs.stat(path)
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error("Only small regular text files are readable")
    const content = await fs.readFile(path)
    if (content.includes(0)) throw new Error("Binary files are not readable")
    return new TextDecoder("utf-8", { fatal: true }).decode(content)
  }

  async write(workspaceId: string, file: string, content: string) {
    const workspace = await this.get(workspaceId)
    return this.locked(workspace.path, async () => {
      const path = await this.safe(workspace.path, file)
      if (await this.ignored(workspace.path, file)) throw new Error("Ignored files cannot be edited")
      if (Buffer.byteLength(content) > 2 * 1024 * 1024 || content.includes("\0")) throw new Error("Only small text files can be edited")
      await fs.mkdir(dirname(path), { recursive: true })
      await fs.writeFile(path, content)
    })
  }

  async status(workspaceId: string) {
    const workspace = await this.get(workspaceId)
    return this.workspaceStatus(workspace)
  }

  private async workspaceStatus(workspace: Workspace) {
    const head = await optional(workspace.path, ["rev-parse", "--verify", "HEAD"])
    const allowed = new Set(await this.workspaceFiles(workspace))
    const entries = (await run(workspace.path, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--no-renames"])).split("\0").filter(Boolean)
    const files: { path: string; status: string }[] = []
    for (const entry of entries) {
      const path = entry.slice(3)
      if (!allowed.has(path)) {
        if (!entry.slice(0, 2).includes("D")) continue
        try { await this.safe(workspace.path, path); if (await this.ignored(workspace.path, path)) continue } catch { continue }
      }
      files.push({ path, status: entry.slice(0, 2) })
    }
    const diff = await this.diff(workspace, head, files.map(file => file.path))
    return { head, branch: await optional(workspace.path, ["symbolic-ref", "--short", "-q", "HEAD"]) || null, files, diff }
  }

  private async diff(workspace: Workspace, head: string, files: string[]) {
    if (!files.length) return ""
    const tracked = head ? await run(workspace.path, ["diff", "--no-ext-diff", "--no-textconv", head, "--", ...files]) : ""
    const untracked: string[] = []
    for (const file of files) {
      if (!head || !(await optional(workspace.path, ["ls-tree", head, "--", file]))) {
        if (await exists(await this.safe(workspace.path, file))) untracked.push("+++ " + file + "\n" + await this.readFile(workspace, file))
      }
    }
    return [tracked, ...untracked].filter(Boolean).join("\n")
  }

  private async validBranch(path: string, branch: string) {
    if (branch.startsWith("-") || branch === "HEAD") throw new Error("Invalid branch")
    await run(path, ["check-ref-format", "refs/heads/" + branch])
  }

  private async remote(path: string, remote: string) {
    if (!remote || remote.startsWith("-") || !(await run(path, ["remote"])).split("\n").includes(remote)) throw new Error("Select a configured remote")
    const urls = (await run(path, ["remote", "get-url", "--push", "--all", remote])).split("\n")
    if (urls.length !== 1) throw new Error("Publishing requires exactly one push URL")
    return urls[0]!
  }

  private async targets(workspace: Workspace, input: PublishInput) {
    await this.validBranch(workspace.path, input.branch)
    if (input.baseBranch) await this.validBranch(workspace.path, input.baseBranch)
    else if (input.action === "pr") throw new Error("Select a PR base branch")
    if (/^(main|master|develop|release(?:\/.*)?)$/i.test(input.branch)) throw new Error("Protected publishing branch; choose a new feature branch")
    await this.availableBranch(workspace, input.branch)
    const head = await optional(workspace.path, ["rev-parse", "--verify", "HEAD"])
    const target = await optional(workspace.path, ["rev-parse", "--verify", "refs/heads/" + input.branch])
    if (target && target !== head && input.files.length) throw new Error("Publishing branch already exists at a different commit; push it without selecting more files")
    if (input.action === "commit") return ""
    const url = await this.remote(workspace.path, input.remote)
    const heads = await run(workspace.path, ["ls-remote", "--heads", "--", url, "refs/heads/" + input.branch, "refs/heads/" + input.baseBranch])
    const defaultRef = await run(workspace.path, ["ls-remote", "--symref", "--", url, "HEAD"])
    if (defaultRef.split("\n").includes("ref: refs/heads/" + input.branch + "\tHEAD")) throw new Error("Cannot publish to the remote default branch")
    return JSON.stringify({ url, heads, defaultRef })
  }

  private async availableBranch(workspace: Workspace, branch: string) {
    const occupied = await run(workspace.path, ["worktree", "list", "--porcelain"])
    for (const block of occupied.split("\n\n")) {
      if (!block.split("\n").includes("branch refs/heads/" + branch)) continue
      const path = block.split("\n").find(line => line.startsWith("worktree "))?.slice(9)
      if (workspace.mode === "worktree" && path && await fs.realpath(path) === await fs.realpath(workspace.path)) continue
      throw new Error("Branch is checked out; choose a new feature branch")
    }
  }

  private async prRepository(path: string, remote: string) {
    const url = await this.remote(path, remote)
    const match = url.match(/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+?)(?:\.git)?$/)
    if (!match?.[1]) throw new Error("PR publishing requires a GitHub remote")
    return this.repositoryName(match[1])
  }

  private async fingerprint(workspace: Workspace, input: PublishInput) {
    const status = await this.workspaceStatus(workspace)
    const contents = await Promise.all((await this.workspaceFiles(workspace)).map(async file => { const path = await this.safe(workspace.path, file); return [file, hash(await fs.readFile(path)), (await fs.stat(path)).mode] }))
    const indexPath = resolve(workspace.path, await run(workspace.path, ["rev-parse", "--git-path", "index"]))
    const index = await exists(indexPath) ? hash(await fs.readFile(indexPath)) : ""
    const refs = await run(workspace.path, ["show-ref"]).catch(() => "")
    const occupancy = await run(workspace.path, ["worktree", "list", "--porcelain"])
    return hash(JSON.stringify({ input, status, contents, index, refs, occupancy }))
  }

  async preview(input: PublishInput): Promise<Preview> {
    const workspace = await this.get(input.workspaceId)
    return this.locked(workspace.path, async () => {
      if (!["commit", "push", "pr"].includes(input.action) || (input.files.length > 0 && !input.message.trim()) || (input.action === "commit" && !input.files.length)) throw new Error("Select files and supply a commit message")
      if (input.action === "pr" && !input.title?.trim()) throw new Error("Supply a PR title")
      const status = await this.workspaceStatus(workspace)
      if (!status.head && !input.files.length) throw new Error("There is no commit to publish")
      const selected = [...new Set(input.files)].sort()
      for (const file of selected) {
        await this.safe(workspace.path, file)
        if (await this.ignored(workspace.path, file) || await this.gitIgnored(workspace.path, file) || !status.files.some(entry => entry.path === file)) throw new Error("Select only changed, non-ignored text files")
      }
      if (await run(workspace.path, ["diff", "--cached", "--name-only"])) throw new Error("Unstage existing changes before publishing; unrelated staging is never consumed")
      const normalized = { ...input, files: selected }
      const remoteHeads = await this.targets(workspace, normalized)
      let diff = await this.diff(workspace, status.head, selected)
      if (!selected.length) {
        const target = await optional(workspace.path, ["rev-parse", "--verify", "refs/heads/" + input.branch]) || status.head
        const base = await optional(workspace.path, ["rev-parse", "--verify", "refs/heads/" + input.baseBranch])
        if (base) diff = await run(workspace.path, ["diff", "--no-ext-diff", "--no-textconv", "--stat", base, target])
      }
      const preview = { ...normalized, id: randomUUID(), head: status.head, diff, expiresAt: new Date(Date.now() + 600_000).toISOString() }
      await this.save("preview-" + preview.id, { preview, fingerprint: await this.fingerprint(workspace, normalized), remoteHeads } satisfies StoredPreview)
      return preview
    })
  }

  async publish({ previewId }: { previewId: string }): Promise<{ commitSha: string; branch: string; prUrl?: string }> {
    const stored = await this.load<StoredPreview>("preview-" + previewId)
    const workspace = await this.get(stored.preview.workspaceId)
    return this.locked(workspace.path, async () => {
      const state = await this.load<StoredPreview>("preview-" + previewId)
      const input = state.preview
      if (state.stage === "done") return state.receipt!
      if (Date.parse(input.expiresAt) < Date.now()) throw new Error("Preview expired; create a new preview")
      if (!state.receipt) {
        const { id, head, diff, expiresAt, ...original } = input
        if (await this.fingerprint(workspace, original) !== state.fingerprint || await this.targets(workspace, input) !== state.remoteHeads) throw new Error("Preview is stale; review a new preview")
        const index = join(this.registry, "index-" + randomUUID())
        const env = { GIT_INDEX_FILE: index }
        try {
          let commitSha = input.files.length ? head : await optional(workspace.path, ["rev-parse", "--verify", "refs/heads/" + input.branch]) || head
          if (input.files.length) {
            await run(workspace.path, head ? ["read-tree", head] : ["read-tree", "--empty"], env)
            for (const file of input.files) {
              if (await this.ignored(workspace.path, file) || await this.gitIgnored(workspace.path, file)) throw new Error("Selected file is now ignored; review a new preview")
              const path = await this.safe(workspace.path, file)
              if (await exists(path)) {
                const content = Buffer.from(await this.readFile(workspace, file))
                const blob = await run(workspace.path, ["hash-object", "--no-filters", "-w", "--stdin"], env, content)
                const mode = (await fs.stat(path)).mode & 0o111 ? "100755" : "100644"
                await run(workspace.path, ["update-index", "--add", "--cacheinfo", mode, blob, file], env)
              } else await run(workspace.path, ["update-index", "--force-remove", "--", file], env)
            }
            const tree = await run(workspace.path, ["write-tree"], env)
            if (await this.fingerprint(workspace, original) !== state.fingerprint || await this.targets(workspace, input) !== state.remoteHeads) throw new Error("Preview is stale; review a new preview")
            commitSha = await run(workspace.path, ["commit-tree", tree, ...(head ? ["-p", head] : []), "-m", input.message])
          }
          if (workspace.mode === "worktree") state.indexTree = await run(workspace.path, ["write-tree"])
          state.receipt = { commitSha, branch: input.branch }
          await this.save("preview-" + previewId, state)
        } finally { await fs.rm(index, { force: true }) }
      }
      const receipt = state.receipt!
      await this.availableBranch(workspace, input.branch)
      const actualHead = await optional(workspace.path, ["rev-parse", "--verify", "HEAD"])
      if (actualHead !== input.head && !(workspace.mode === "worktree" && actualHead === receipt.commitSha)) throw new Error("Workspace HEAD changed; publication stopped")
      if (!state.stage) {
        const ref = "refs/heads/" + input.branch
        const existing = await optional(workspace.path, ["rev-parse", "--verify", ref])
        if (existing && existing !== input.head && existing !== receipt.commitSha) throw new Error("Publishing branch changed; commit preserved")
        if (existing !== receipt.commitSha) await run(workspace.path, ["update-ref", ref, receipt.commitSha, existing === input.head ? input.head : "0".repeat(40)])
        state.stage = "committed"
        await this.save("preview-" + previewId, state)
      }
      if (workspace.mode === "worktree" && state.stage === "committed") {
        const indexTree = await run(workspace.path, ["write-tree"])
        const commitTree = await run(workspace.path, ["rev-parse", receipt.commitSha + "^{tree}"])
        if (indexTree !== state.indexTree && indexTree !== commitTree) throw new Error("Index changed after commit; unstage new changes before resuming publication")
        await run(workspace.path, ["read-tree", "--reset", receipt.commitSha])
        await run(workspace.path, ["symbolic-ref", "HEAD", "refs/heads/" + input.branch])
        workspace.branch = input.branch
        await this.save(workspace.id, workspace)
        state.stage = "attached"
        await this.save("preview-" + previewId, state)
      }
      if (input.action !== "commit" && (state.stage === "committed" || state.stage === "attached")) {
        if (await optional(workspace.path, ["rev-parse", "--verify", "refs/heads/" + input.branch]) !== receipt.commitSha) throw new Error("Publishing branch changed; push refused")
        const remote = await this.remote(workspace.path, input.remote)
        const expected = JSON.parse(state.remoteHeads) as { url: string; heads: string; defaultRef: string }
        if (remote !== expected.url) throw new Error("Publishing remote changed; push refused")
        const actual = await run(workspace.path, ["ls-remote", "--heads", "--", remote, "refs/heads/" + input.branch])
        if (!actual.startsWith(receipt.commitSha + "\t")) {
          const heads = await run(workspace.path, ["ls-remote", "--heads", "--", remote, "refs/heads/" + input.branch, "refs/heads/" + input.baseBranch])
          const defaultRef = await run(workspace.path, ["ls-remote", "--symref", "--", remote, "HEAD"])
          if (remote !== expected.url || heads !== expected.heads || defaultRef !== expected.defaultRef) throw new Error("Remote changed; commit preserved, push refused")
          await run(workspace.path, ["push", "--", input.remote, receipt.commitSha + ":refs/heads/" + input.branch])
        }
        state.stage = "pushed"
        await this.save("preview-" + previewId, state)
      }
      if (input.action === "pr" && !receipt.prUrl) {
        const expected = JSON.parse(state.remoteHeads) as { url: string; heads: string; defaultRef: string }
        const remote = await this.remote(workspace.path, input.remote)
        if (remote !== expected.url) throw new Error("Publishing remote changed; PR creation refused")
        const heads = await run(workspace.path, ["ls-remote", "--heads", "--", remote, "refs/heads/" + input.branch, "refs/heads/" + input.baseBranch])
        const baseEntry = (value: string) => value.split("\n").find(line => line.endsWith("\trefs/heads/" + input.baseBranch)) ?? ""
        if (baseEntry(heads) !== baseEntry(expected.heads) || !heads.split("\n").includes(receipt.commitSha + "\trefs/heads/" + input.branch)) throw new Error("Remote branch changed; PR creation refused")
        let existing: string | undefined
        if (state.stage === "pr-started") {
          if (this.injectedPublisher) throw new Error("PR result uncertain; inspect the provider before retrying with a new preview")
          const repository = await this.prRepository(workspace.path, input.remote)
          const result = await exec("gh", ["pr", "list", "--repo", repository, "--head", input.branch, "--base", input.baseBranch, "--state", "all", "--json", "url", "--limit", "1"], { cwd: workspace.path, timeout: 30_000 })
          existing = (JSON.parse(result.stdout) as { url: string }[])[0]?.url
          if (!existing) throw new Error("PR result uncertain; inspect GitHub before retrying with a new preview")
        }
        state.stage = "pr-started"
        await this.save("preview-" + previewId, state)
        receipt.prUrl = existing ?? await this.publishPr({ cwd: workspace.path, branch: input.branch, baseBranch: input.baseBranch, remote: input.remote, title: input.title!, body: input.body ?? "" })
      }
      state.stage = "done"
      await this.save("preview-" + previewId, state)
      return receipt
    })
  }

  async ignoredFiles(projectId: string): Promise<string[]> {
    const project = await this.project(projectId)
    if (!project.isGit) return []
    return this.ignoredCandidates(project.path)
  }

  private async ignoredCandidates(source: string): Promise<string[]> {
    if (await fs.realpath(source) !== resolve(source)) throw new Error("Project root or ancestors cannot be symlinks")
    const include = await this.safe(source, ".worktreeinclude")
    if (!await exists(include)) return []
    if ((await fs.stat(include)).size > 64 * 1024) throw new Error("Narrow the .worktreeinclude file before copying ignored files")
    const patterns = (await fs.readFile(include, "utf8")).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith("#"))
    const candidates = (await run(source, ["ls-files", "-z", "--others", "--ignored", "--exclude-standard"])).split("\0").filter(Boolean)
    const result: string[] = []
    let bytes = 0
    for (const file of candidates) {
      let included = false
      for (const line of patterns) {
        const negative = line.startsWith("!")
        const pattern = negative ? line.slice(1) : line
        const anchored = pattern.startsWith("/")
        const normalized = pattern.replace(/^\//, "").replace(/\/$/, "")
        if (!normalized) continue
        const glob = new Bun.Glob(normalized)
        const parts = file.split("/")
        const prefixes = parts.map((_, index) => parts.slice(0, index + 1).join("/"))
        const matches = anchored || normalized.includes("/") ? prefixes.some(prefix => glob.match(prefix)) : parts.some(part => glob.match(part))
        if (matches) included = !negative
      }
      if (!included) continue
      try {
        const from = await this.safe(source, file)
        const stat = await fs.lstat(from)
        if (!stat.isFile()) continue
        result.push(file)
        bytes += stat.size
      } catch { continue }
      if (result.length > 100 || bytes > 20 * 1024 * 1024) throw new Error("Ignored-file copy exceeds 100 files or 20 MiB; narrow .worktreeinclude")
    }
    return result.sort()
  }

  private async copyIgnored(source: string, destination: string) {
    for (const file of await this.ignoredCandidates(source)) {
      const from = await this.safe(source, file)
      const to = await this.safe(destination, file)
      if (await exists(to)) continue
      await fs.mkdir(dirname(to), { recursive: true })
      await fs.copyFile(from, to, 1)
    }
  }
}

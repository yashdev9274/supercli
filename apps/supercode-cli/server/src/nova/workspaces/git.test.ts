import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { execFile } from "node:child_process"
import { promises as fs } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import { NovaWorkspaceGit, parseGitWorktrees } from "./git"
import type { PublishInput } from "./git"

const exec = promisify(execFile)
setDefaultTimeout(20_000)
const temporary: string[] = []
const git = async (cwd: string, ...args: string[]) => (await exec("git", ["-C", cwd, ...args])).stdout.trim()

afterEach(async () => {
  await Promise.all(temporary.splice(0).map(path => fs.rm(path, { recursive: true, force: true })))
})

async function fixture(options: { unborn?: boolean; publishPr?: ConstructorParameters<typeof NovaWorkspaceGit>[0]["publishPr"] } = {}) {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "nova-git-test-")))
  temporary.push(root)
  const repo = join(root, "project")
  const remote = join(root, "remote.git")
  const home = join(root, "home")
  await fs.mkdir(repo)
  await git(repo, "init", "-b", "main")
  await git(repo, "config", "user.name", "Nova Test")
  await git(repo, "config", "user.email", "nova-test@example.invalid")
  await fs.writeFile(join(repo, "a.txt"), "original\n")
  await fs.writeFile(join(repo, "b.txt"), "other\n")
  await fs.writeFile(join(repo, ".gitignore"), ".env*\nignored/\n")
  if (!options.unborn) {
    await git(repo, "add", ".")
    await git(repo, "commit", "-m", "initial")
  }
  await git(root, "init", "--bare", remote)
  await git(repo, "remote", "add", "origin", remote)
  if (!options.unborn) {
    await git(repo, "push", "origin", "main")
    await git(remote, "symbolic-ref", "HEAD", "refs/heads/main")
  }
  const engine = new NovaWorkspaceGit({ roots: [repo], home, publishPr: options.publishPr })
  const project = (await engine.listProjects())[0]!
  const create = (threadId = "thread", mode: "current" | "worktree" = "worktree", extra = {}) => engine.create({ projectId: project.id, threadId, sourceRef: "main", mode, ...extra })
  return { root, repo, remote, home, engine, project, create }
}

const publication = (workspaceId: string, extra: Partial<PublishInput> = {}): PublishInput => ({ workspaceId, action: "commit", branch: "feature/test", baseBranch: "main", remote: "origin", message: "selected changes", files: ["a.txt"], ...extra })

describe("NovaWorkspaceGit", () => {
  test("discovers real external, detached, locked and missing worktrees without registering them", async () => {
    const f = await fixture()
    const external = join(f.root, "external tree with spaces\nand newline")
    const missing = join(f.root, "missing tree")
    await git(f.repo, "worktree", "add", "-b", "external/topic", external)
    await git(f.repo, "worktree", "lock", "--reason", "keep this tree", external)
    await git(f.repo, "worktree", "add", "--detach", missing)
    await fs.rm(missing, { recursive: true })
    const managed = await f.create()
    const head = await git(f.repo, "rev-parse", "HEAD")
    const trees = await f.engine.worktrees(f.project.id)
    expect(trees).toHaveLength(4)
    expect(trees[0]).toEqual({ path: f.repo, branch: "main", head, main: true, locked: false, prunable: false })
    expect(trees.find(tree => tree.path === external)).toEqual({ path: external, branch: "external/topic", head, main: false, locked: true, prunable: false })
    expect(trees.find(tree => tree.path === missing)).toEqual({ path: missing, branch: null, head, main: false, locked: false, prunable: true })
    expect(trees.find(tree => tree.path === managed.path)).toMatchObject({ branch: null, workspaceId: managed.id, threadId: managed.threadId })
    expect(await f.engine.lookup("external")).toBeNull()
    await expect(f.engine.get(external)).rejects.toThrow("Invalid registry ID")
    await expect(f.engine.worktrees("unknown")).rejects.toThrow("Unknown project")
    const linkedEngine = new NovaWorkspaceGit({ roots: [external], home: f.home })
    const linkedProject = (await linkedEngine.listProjects())[0]!
    const linkedTrees = await linkedEngine.worktrees(linkedProject.id)
    expect(linkedTrees[0]?.main).toBe(true)
    expect(linkedTrees.find(tree => tree.path === external)?.main).toBe(false)
    expect(linkedTrees.every(tree => !tree.workspaceId && !tree.threadId)).toBe(true)
  })

  test("omits stale and ambiguous engine metadata without hiding Git entries", async () => {
    const f = await fixture()
    const managed = await f.create()
    const bindingFile = join(f.home, ".nova/worktrees", "binding-" + managed.id + ".json")
    const binding = JSON.parse(await fs.readFile(bindingFile, "utf8"))
    await fs.writeFile(bindingFile, JSON.stringify({ ...binding, gitDir: "/stale" }))
    expect((await f.engine.worktrees(f.project.id)).find(tree => tree.path === managed.path)?.workspaceId).toBeUndefined()
    await fs.rm(managed.path, { recursive: true })
    expect((await f.engine.worktrees(f.project.id)).find(tree => tree.path === managed.path)).toMatchObject({ prunable: true })
    await f.create("current-one", "current")
    await f.create("current-two", "current")
    await f.create("current-three", "current")
    const current = (await f.engine.worktrees(f.project.id))[0]!
    expect(current.workspaceId).toBeUndefined()
    expect(current.threadId).toBeUndefined()
  })

  test("lists unborn repositories and rejects malformed or oversized NUL porcelain", async () => {
    const f = await fixture({ unborn: true })
    expect(await f.engine.worktrees(f.project.id)).toEqual([{ path: f.repo, branch: "main", head: "0".repeat(40), main: true, locked: false, prunable: false }])
    const block = "worktree /safe path\0HEAD " + "a".repeat(40) + "\0detached\0\0"
    expect(parseGitWorktrees(block)[0]?.branch).toBeNull()
    expect(parseGitWorktrees("worktree /bare\0bare\0\0")[0]?.head).toBe("")
    for (const malformed of ["", block.slice(0, -1), block + block, block.replace("/safe path", "relative"), block.replace("detached", "branch refs/heads/main\0detached"), block.replace("detached", "locked"), block.replace("detached", "unknown value"), block.replace("HEAD ", "HEAD not-a-hash")]) {
      expect(() => parseGitWorktrees(malformed)).toThrow("Invalid Git worktree listing")
    }
    expect(() => parseGitWorktrees("x".repeat(1024 * 1024 + 1))).toThrow("discovery limits")
    expect(() => parseGitWorktrees(Array.from({ length: 257 }, (_, i) => block.replace("/safe path", "/tree-" + i)).join(""))).toThrow("discovery limits")
  })

  test("creates an explicitly requested new working branch without switching the original checkout", async () => {
    const f = await fixture()
    const workspace = await f.create("named-worktree", "worktree", { newBranch: "nova/new-feature" })
    expect(workspace.branch).toBe("nova/new-feature")
    expect(await git(workspace.path, "symbolic-ref", "--short", "HEAD")).toBe("nova/new-feature")
    expect(await git(f.repo, "symbolic-ref", "--short", "HEAD")).toBe("main")
    await expect(f.create("other", "worktree", { newBranch: "nova/new-feature" })).rejects.toThrow("already exists")
    expect(await f.create("named-worktree", "worktree", { newBranch: "nova/new-feature" })).toEqual(workspace)
  })
  test("isolates detached worktrees without touching dirty local edits and persists bindings", async () => {
    const f = await fixture()
    await fs.writeFile(join(f.repo, "a.txt"), "dirty original\n")
    const workspace = await f.create()
    expect(await git(workspace.path, "rev-parse", "HEAD")).toBe(workspace.baseSha)
    expect(await git(workspace.path, "status", "--porcelain")).toBe("")
    expect(await fs.readFile(join(f.repo, "a.txt"), "utf8")).toBe("dirty original\n")
    expect(await f.create()).toEqual(workspace)
    const restarted = new NovaWorkspaceGit({ roots: [f.repo], home: f.home })
    expect(await restarted.get(workspace.id)).toEqual(workspace)
    expect(await restarted.lookup("thread")).toEqual(workspace)
    expect(await restarted.lookup("missing")).toBeNull()
    await expect(restarted.lookup("../escape")).rejects.toThrow("thread ID")
    const otherRoots = new NovaWorkspaceGit({ roots: [], home: f.home })
    expect(await otherRoots.lookup("thread")).toBeNull()
    await expect(otherRoots.get(workspace.id)).rejects.toThrow("Unknown project")
    expect((await fs.stat(join(f.home, ".nova/worktrees", workspace.id + ".json"))).mode & 0o777).toBe(0o600)
    await expect(f.create("thread", "current")).rejects.toThrow("different workspace")
    await expect(f.engine.create({ projectId: f.project.id, threadId: "../escape", sourceRef: "main", mode: "worktree" })).rejects.toThrow("thread ID")
  })

  test("only accepts listed branches and refreshes remote starting refs", async () => {
    const f = await fixture()
    const refs = await f.engine.branches(f.project.id)
    expect(refs.find(ref => ref.name === "main")).toMatchObject({ current: true, checkedOut: true })
    expect(refs.some(ref => ref.name === "origin/main")).toBe(true)
    await git(f.remote, "update-ref", "refs/heads/new-remote-branch", refs[0]!.sha)
    expect((await f.engine.branches(f.project.id)).some(ref => ref.name === "origin/new-remote-branch")).toBe(false)
    expect((await f.engine.fetchBranches(f.project.id)).some(ref => ref.name === "origin/new-remote-branch")).toBe(true)
    await expect(f.engine.create({ projectId: f.project.id, threadId: "attack", sourceRef: "main^{tree}", mode: "worktree" })).rejects.toThrow("listed branch")
    await fs.writeFile(join(f.repo, "a.txt"), "remote revision\n")
    await git(f.repo, "add", "a.txt")
    await git(f.repo, "commit", "-m", "remote update")
    await git(f.repo, "push", "origin", "main")
    const workspace = await f.engine.create({ projectId: f.project.id, threadId: "remote", sourceRef: "refs/remotes/origin/main", mode: "worktree" })
    expect(await f.engine.read(workspace.id, "a.txt")).toBe("remote revision\n")
  })

  test("copies ignored files only by opt-in and keeps secrets out of read/status APIs", async () => {
    const f = await fixture()
    await fs.writeFile(join(f.repo, ".env"), "PRIVATE=hidden\n")
    await fs.writeFile(join(f.repo, ".env.example"), "PRIVATE=example\n")
    await fs.mkdir(join(f.repo, "ignored"))
    await fs.writeFile(join(f.repo, "ignored", "local.txt"), "hidden ignored content")
    await fs.symlink(join(f.repo, "a.txt"), join(f.repo, "ignored", "link"))
    await fs.writeFile(join(f.repo, ".worktreeinclude"), ".env\n.env.example\n/ignored/\na.txt\n")
    expect(await f.engine.ignoredFiles(f.project.id)).toEqual([".env", ".env.example", "ignored/local.txt"])
    const normal = await f.create("normal")
    expect(await fs.exists(join(normal.path, ".env"))).toBe(false)
    const copied = await f.create("copied", "worktree", { copyIgnored: true })
    expect(await fs.readFile(join(copied.path, ".env"), "utf8")).toBe("PRIVATE=hidden\n")
    expect(await fs.exists(join(copied.path, "ignored", "link"))).toBe(false)
    expect(await f.engine.files(copied.id)).toContain(".env.example")
    expect(await f.engine.files(copied.id)).not.toContain(".env")
    await expect(f.engine.read(copied.id, ".env")).rejects.toThrow()
    await expect(f.engine.write(copied.id, ".env", "oops")).rejects.toThrow("Ignored")
    expect((await f.engine.status(copied.id)).diff).not.toContain("hidden")
  })

  test("refuses symlink traversal, .git writes, ignored selected files and binary reads", async () => {
    const f = await fixture()
    const w = await f.create()
    await fs.symlink(f.root, join(w.path, "escape"))
    await fs.writeFile(join(w.path, "binary"), Buffer.from([0, 255]))
    await expect(f.engine.write(w.id, "escape/out", "bad")).rejects.toThrow("Symlink")
    await expect(f.engine.write(w.id, ".git/config", "bad")).rejects.toThrow("Unsafe")
    await expect(f.engine.write(w.id, "../out", "bad")).rejects.toThrow("Unsafe")
    await expect(f.engine.read(w.id, "binary")).rejects.toThrow()
    await fs.writeFile(join(w.path, ".env"), "secret")
    await expect(f.engine.preview(publication(w.id, { files: [".env"] }))).rejects.toThrow()
  })

  test("commits only selected changes using a temporary index and preserves original checkout", async () => {
    const f = await fixture()
    const w = await f.create("current", "current")
    const initial = await git(f.repo, "rev-parse", "HEAD")
    await f.engine.write(w.id, "a.txt", "selected\n")
    await f.engine.write(w.id, "b.txt", "unrelated\n")
    await f.engine.write(w.id, "new.txt", "new contents\n")
    const preview = await f.engine.preview(publication(w.id, { files: ["a.txt", "new.txt"] }))
    expect(preview.diff).toContain("new contents")
    const result = await f.engine.publish({ previewId: preview.id })
    expect(await git(f.repo, "show", result.commitSha + ":a.txt")).toBe("selected")
    expect(await git(f.repo, "show", result.commitSha + ":b.txt")).toBe("other")
    expect(await git(f.repo, "show", result.commitSha + ":new.txt")).toBe("new contents")
    expect(await git(f.repo, "rev-parse", "HEAD")).toBe(initial)
    expect(await git(f.repo, "diff", "--cached", "--name-only")).toBe("")
    expect(await fs.readFile(join(f.repo, "b.txt"), "utf8")).toBe("unrelated\n")
    expect(await f.engine.publish({ previewId: preview.id })).toEqual(result)
  })

  test("rejects existing staging rather than sweeping it into publication", async () => {
    const f = await fixture()
    const w = await f.create()
    await f.engine.write(w.id, "a.txt", "change")
    await f.engine.write(w.id, "b.txt", "staged")
    await git(w.path, "add", "b.txt")
    await expect(f.engine.preview(publication(w.id))).rejects.toThrow("Unstage")
    expect(await git(w.path, "diff", "--cached", "--name-only")).toBe("b.txt")
  })

  test("blocks occupied and protected branches and rejects branch injection", async () => {
    const f = await fixture()
    const w = await f.create()
    await f.engine.write(w.id, "a.txt", "change")
    await git(f.repo, "branch", "feature/occupied")
    await git(f.repo, "worktree", "add", join(f.root, "occupied"), "feature/occupied")
    for (const branch of ["main", "master", "develop", "release/next", "feature/occupied", "--upload-pack=bad", "HEAD~1"]) {
      await expect(f.engine.preview(publication(w.id, { branch }))).rejects.toThrow()
    }
    await git(f.remote, "update-ref", "refs/heads/trunk", w.baseSha)
    await git(f.remote, "symbolic-ref", "HEAD", "refs/heads/trunk")
    await expect(f.engine.preview(publication(w.id, { branch: "trunk", action: "push" }))).rejects.toThrow("default branch")
  })

  test("invalidates previews on untracked content, index, HEAD and occupancy changes", async () => {
    const f = await fixture()
    const w = await f.create()
    await f.engine.write(w.id, "a.txt", "selected")
    const first = await f.engine.preview(publication(w.id))
    await f.engine.write(w.id, "untracked", "new")
    await expect(f.engine.publish({ previewId: first.id })).rejects.toThrow("stale")
    const second = await f.engine.preview(publication(w.id))
    await git(w.path, "add", "untracked")
    await expect(f.engine.publish({ previewId: second.id })).rejects.toThrow("stale")
    await git(w.path, "reset", "--", "untracked")
    const third = await f.engine.preview(publication(w.id))
    await git(f.repo, "branch", "feature/test")
    await git(f.repo, "worktree", "add", join(f.root, "occupancy"), "feature/test")
    await expect(f.engine.publish({ previewId: third.id })).rejects.toThrow("stale")
  }, 20_000)

  test("pushes a new explicit branch and refuses stale remote previews", async () => {
    const f = await fixture()
    const w = await f.create()
    await f.engine.write(w.id, "a.txt", "pushed")
    const stale = await f.engine.preview(publication(w.id, { action: "push" }))
    const tree = await git(f.repo, "rev-parse", "HEAD^{tree}")
    const remoteCommit = await git(f.repo, "commit-tree", tree, "-p", w.baseSha, "-m", "advance remote only")
    await git(f.repo, "push", f.remote, remoteCommit + ":refs/heads/main")
    await expect(f.engine.publish({ previewId: stale.id })).rejects.toThrow("stale")
    const preview = await f.engine.preview(publication(w.id, { action: "push" }))
    const result = await f.engine.publish({ previewId: preview.id })
    expect(await git(f.remote, "rev-parse", "refs/heads/feature/test")).toBe(result.commitSha)
  })

  test("supports pushing existing HEAD without creating a commit and injected PR publishing", async () => {
    const calls: unknown[] = []
    const f = await fixture({ publishPr: async input => { calls.push(input); return "https://github.com/test/repo/pull/1" } })
    const w = await f.create()
    const preview = await f.engine.preview(publication(w.id, { action: "pr", files: [], message: "", title: "Explicit PR" }))
    const result = await f.engine.publish({ previewId: preview.id })
    expect(result.commitSha).toBe(w.baseSha)
    expect(result.prUrl).toBe("https://github.com/test/repo/pull/1")
    expect(calls).toHaveLength(1)
    await f.engine.publish({ previewId: preview.id })
    expect(calls).toHaveLength(1)
  })

  test("a separate push preview can publish a previously committed branch", async () => {
    const f = await fixture()
    const w = await f.create()
    await f.engine.write(w.id, "a.txt", "selected")
    const commitPreview = await f.engine.preview(publication(w.id))
    const committed = await f.engine.publish({ previewId: commitPreview.id })
    const pushPreview = await f.engine.preview(publication(w.id, { action: "push", files: [], message: "", baseBranch: "" }))
    const pushed = await f.engine.publish({ previewId: pushPreview.id })
    expect(pushed.commitSha).toBe(committed.commitSha)
    expect(await git(f.remote, "rev-parse", "refs/heads/feature/test")).toBe(committed.commitSha)
  })

  test("an uncertain PR result never repeats the commit or injected publisher", async () => {
    let attempts = 0
    const f = await fixture({ publishPr: async () => { attempts++; throw new Error("connection lost after PR request") } })
    const w = await f.create()
    await f.engine.write(w.id, "a.txt", "selected")
    const preview = await f.engine.preview(publication(w.id, { action: "pr", title: "Test" }))
    await expect(f.engine.publish({ previewId: preview.id })).rejects.toThrow("connection lost")
    const committed = await git(f.repo, "rev-parse", "refs/heads/feature/test")
    await expect(f.engine.publish({ previewId: preview.id })).rejects.toThrow("uncertain")
    expect(attempts).toBe(1)
    expect(await git(f.remote, "rev-parse", "refs/heads/feature/test")).toBe(committed)
    expect(await git(f.repo, "rev-parse", "refs/heads/feature/test")).toBe(committed)
  })

  test("HEAD changes invalidate a preview before any branch mutation", async () => {
    const f = await fixture()
    const w = await f.create()
    await f.engine.write(w.id, "a.txt", "selected")
    const preview = await f.engine.preview(publication(w.id))
    const tree = await git(w.path, "rev-parse", "HEAD^{tree}")
    const next = await git(w.path, "commit-tree", tree, "-p", w.baseSha, "-m", "changed head")
    await git(w.path, "update-ref", "HEAD", next)
    await expect(f.engine.publish({ previewId: preview.id })).rejects.toThrow("stale")
    await expect(git(w.path, "rev-parse", "--verify", "refs/heads/feature/test")).rejects.toThrow()
  })

  test("unborn current checkout is usable but cannot create a worktree", async () => {
    const f = await fixture({ unborn: true })
    await expect(f.create()).rejects.toThrow("require a commit")
    const w = await f.create("unborn", "current")
    expect(w.baseSha).toBe("")
    expect(await f.engine.files(w.id)).toContain("a.txt")
    const preview = await f.engine.preview(publication(w.id))
    const result = await f.engine.publish({ previewId: preview.id })
    expect(await git(f.repo, "show", result.commitSha + ":a.txt")).toBe("original")
    expect((await f.engine.status(w.id)).head).toBe("")
  })

  test("initialization is explicit and creates no first commit", async () => {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), "nova-init-test-")))
    temporary.push(root)
    const engine = new NovaWorkspaceGit({ roots: [root], home: join(root, "home") })
    const project = (await engine.listProjects())[0]!
    expect(project.isGit).toBe(false)
    await expect(engine.create({ projectId: project.id, threadId: "test", mode: "current", sourceRef: "" })).rejects.toThrow("explicitly")
    expect((await engine.initialize(project.id)).isGit).toBe(true)
    await expect(git(root, "rev-parse", "--verify", "HEAD")).rejects.toThrow()
  })

  test("refuses in-progress operations and expired previews", async () => {
    const f = await fixture()
    const w = await f.create()
    await f.engine.write(w.id, "a.txt", "change")
    const preview = await f.engine.preview(publication(w.id))
    const mergeHead = await git(w.path, "rev-parse", "--git-path", "MERGE_HEAD")
    await fs.writeFile(mergeHead, w.baseSha)
    await expect(f.engine.publish({ previewId: preview.id })).rejects.toThrow("in-progress")
    await fs.rm(mergeHead)
    const manifest = join(f.home, ".nova/worktrees", "preview-" + preview.id + ".json")
    const stored = JSON.parse(await fs.readFile(manifest, "utf8"))
    stored.preview.expiresAt = new Date(0).toISOString()
    await fs.writeFile(manifest, JSON.stringify(stored))
    await expect(f.engine.publish({ previewId: preview.id })).rejects.toThrow("expired")
  })

  test("managed worktrees advance their branch and support subsequent commits without losing other edits", async () => {
    const f = await fixture()
    const w = await f.create()
    await f.engine.write(w.id, "a.txt", "first")
    await f.engine.write(w.id, "b.txt", "unrelated")
    const first = await f.engine.publish({ previewId: (await f.engine.preview(publication(w.id))).id })
    expect((await f.engine.status(w.id)).files).toEqual([{ path: "b.txt", status: " M" }])
    expect((await f.engine.get(w.id)).branch).toBe("feature/test")
    await f.engine.write(w.id, "a.txt", "second")
    const second = await f.engine.publish({ previewId: (await f.engine.preview(publication(w.id, { message: "second change" }))).id })
    expect(await git(w.path, "rev-parse", "HEAD")).toBe(second.commitSha)
    expect(await git(w.path, "rev-parse", "HEAD^1")).toBe(first.commitSha)
    expect(await f.engine.read(w.id, "b.txt")).toBe("unrelated")
    expect(await git(f.repo, "rev-parse", "HEAD")).toBe(w.baseSha)
  })

  test("does not execute clean filters, hooks, or fsmonitor while previewing and committing", async () => {
    const f = await fixture()
    const w = await f.create()
    const sentinel = join(f.root, "executed")
    await fs.writeFile(join(w.path, ".gitattributes"), "*.txt filter=unsafe\n")
    await git(f.repo, "config", "filter.unsafe.clean", "touch " + sentinel)
    await git(f.repo, "config", "filter.unsafe.required", "true")
    await git(f.repo, "config", "core.fsmonitor", "touch " + sentinel)
    await f.engine.write(w.id, "a.txt", "raw file contents\n")
    const preview = await f.engine.preview(publication(w.id))
    const result = await f.engine.publish({ previewId: preview.id })
    expect(await fs.exists(sentinel)).toBe(false)
    expect(await git(f.repo, "show", result.commitSha + ":a.txt")).toBe("raw file contents")
  })

  test("rejects replacement repositories and symlinked worktree roots", async () => {
    const f = await fixture()
    const w = await f.create()
    const moved = w.path + "-original"
    await fs.rename(w.path, moved)
    await fs.symlink(moved, w.path)
    await expect(f.engine.get(w.id)).rejects.toThrow("symlinks")
    await fs.rm(w.path)
    await fs.mkdir(w.path)
    await git(w.path, "init")
    await expect(f.engine.get(w.id)).rejects.toThrow("linkage")
  })

  test("managed clones are validated and persist in the explicit project allowlist", async () => {
    const f = await fixture()
    for (const name of ["https://github.com/owner/repo", "../repo", "owner/..", "owner/repo;touch bad", "--upload-pack/repo"]) {
      await expect(f.engine.cloneRepository(name)).rejects.toThrow("owner/name")
    }
    const name = "owner/repository"
    const count = process.env.GIT_CONFIG_COUNT
    const index = Number(count ?? 0)
    const key = "GIT_CONFIG_KEY_" + index
    const value = "GIT_CONFIG_VALUE_" + index
    const previousKey = process.env[key]
    const previousValue = process.env[value]
    process.env.GIT_CONFIG_COUNT = String(index + 1)
    process.env[key] = "url.file://" + f.remote + ".insteadOf"
    process.env[value] = "https://github.com/" + name + ".git"
    try {
      const project = await f.engine.cloneRepository(name)
      expect(project.repositoryFullName).toBe(name)
      expect(project.name).toBe("repository")
      expect(await f.engine.cloneRepository(name)).toEqual(project)
      const restarted = new NovaWorkspaceGit({ roots: [], home: f.home })
      expect(await restarted.listProjects()).toEqual([project])
      expect((await fs.stat(join(f.home, ".nova/worktrees/repositories.json"))).mode & 0o777).toBe(0o600)
    } finally {
      if (count === undefined) delete process.env.GIT_CONFIG_COUNT; else process.env.GIT_CONFIG_COUNT = count
      if (previousKey === undefined) delete process.env[key]; else process.env[key] = previousKey
      if (previousValue === undefined) delete process.env[value]; else process.env[value] = previousValue
    }
  })

  test("ignored copy planning is bounded before a worktree is created", async () => {
    const f = await fixture()
    await fs.mkdir(join(f.repo, "ignored"))
    await fs.writeFile(join(f.repo, ".worktreeinclude"), "ignored/\n")
    await Promise.all(Array.from({ length: 101 }, (_, index) => fs.writeFile(join(f.repo, "ignored", String(index)), "small")))
    await expect(f.engine.ignoredFiles(f.project.id)).rejects.toThrow("100 files")
    await expect(f.create("too-many", "worktree", { copyIgnored: true })).rejects.toThrow("100 files")
    expect((await git(f.repo, "worktree", "list", "--porcelain")).match(/^worktree /gm)).toHaveLength(1)
  })
})

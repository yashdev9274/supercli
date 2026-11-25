import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { exportPatch } from "../sandbox/tools"
import { executeRepositoryOperation, type RepositoryVerification, type RepositoryWorkspace } from "./repository-engine"

const exec = promisify(execFile)

test("real Git patch evidence includes tracked and untracked content and rejects later edits", async () => {
  const root = await mkdtemp(join(tmpdir(), "nova-verified-repository-"))
  try {
    const git = (...args: string[]) => exec("/usr/bin/git", args, { cwd: root })
    await git("init", "--quiet")
    await writeFile(join(root, "tracked.txt"), "original\n")
    await git("add", "tracked.txt")
    const base = (await git("write-tree")).stdout.trim()
    await writeFile(join(root, "tracked.txt"), "edited\n")
    await writeFile(join(root, "untracked.txt"), "first\n")
    const runner = { async runBounded(command: string, args: string[]) {
      try {
        const result = await exec(command, args, { cwd: root, timeout: 20_000, maxBuffer: 1_000_000 })
        return { successful: true, exitCode: 0, stdout: result.stdout, stderr: result.stderr, truncated: false }
      } catch { return { successful: false, exitCode: 1, stdout: "", stderr: "fixture failed", truncated: false } }
    } }
    const patch = () => exportPatch(runner, base)
    let exports = 0
    const workspace: RepositoryWorkspace = {
      async execute(name) {
        if (name !== "run_command") throw new Error("Fixture only runs validation")
        return { success: true, successful: true, exitCode: 0, truncated: false, stdout: "fixture validation passed" }
      },
      async inspectChanges() {
        const diff = await patch()
        return { digest: createHash("sha256").update(JSON.stringify([base, diff])).digest("hex"), status: "fixture", diff }
      },
      async savePatch(expected) {
        const actual = await this.inspectChanges()
        if (actual.digest !== expected) throw new Error("Workspace changed during export")
        exports++
        return "fixture.patch"
      },
      async close() {},
    }
    const result = await executeRepositoryOperation({ name: "repository_verify", args: {}, validationCommands: ["fixture validation"] }, workspace)
    expect(result.success).toBe(true)
    const data = result.data as { verifiedDigest: string; commands: Record<string, unknown>[] }
    const proof: RepositoryVerification = { digest: data.verifiedDigest, commands: data.commands }
    const diff = await patch()
    expect(diff).toContain("+edited")
    expect(diff).toContain("+first")
    await writeFile(join(root, "untracked.txt"), "second\n")
    expect((await executeRepositoryOperation({ name: "repository_finish", args: {}, validationCommands: ["fixture validation"], verified: proof }, workspace)).success).toBe(false)
    expect(exports).toBe(0)
    expect((await patch())).toContain("+second")
  } finally { await rm(root, { recursive: true, force: true }) }
})

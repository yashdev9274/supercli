import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { exportPatch } from "../sandbox/tools"
import { executeRepositoryOperation, type RepositoryWorkspace } from "./repository-engine"

const exec = promisify(execFile)
const cases = [
  { name: "changelog version update", files: { "version.txt": "0.1\n", "changelog.md": "# 0.1\nInitial release\n" }, edits: { "version.txt": "0.2\n", "changelog.md": "# 0.2\nVerified workspace changes\n\n# 0.1\nInitial release\n" }, check: "if(read('version.txt').trim()!=='0.2'||!read('changelog.md').startsWith('# 0.2'))process.exit(1)" },
  { name: "failing test repair", files: { "sum.cjs": "module.exports=(a,b)=>a-b\n" }, edits: { "sum.cjs": "module.exports=(a,b)=>a+b\n" }, check: "if(require('./sum.cjs')(2,3)!==5)process.exit(1)" },
  { name: "multi-file change with new file", files: { "index.cjs": "module.exports=()=>false\n" }, edits: { "index.cjs": "module.exports=require('./feature.cjs')\n", "feature.cjs": "module.exports=()=>true\n" }, check: "if(require('./index.cjs')()!==true)process.exit(1)" },
]

for (const task of cases) test(`verified task contract: ${task.name}`, async () => {
  const root = await mkdtemp(join(tmpdir(), "nova-task-quality-"))
  const commands: string[] = []
  try {
    const git = (...args: string[]) => exec("/usr/bin/git", args, { cwd: root })
    await git("init", "--quiet")
    for (const [name, text] of Object.entries(task.files)) await writeFile(join(root, name), text)
    await git("add", ".")
    const base = (await git("write-tree")).stdout.trim()
    const runner = { async runBounded(cmd: string, args: string[]) {
      try { const result = await exec(cmd, args, { cwd: root, timeout: 10_000, maxBuffer: 1_000_000 }); return { successful: true, exitCode: 0, stdout: result.stdout, stderr: result.stderr, truncated: false } }
      catch { return { successful: false, exitCode: 1, stdout: "", stderr: "Fixture validation failed", truncated: false } }
    } }
    let exports = 0
    const expectedCommand = "fixture:authorized-validation"
    const workspace: RepositoryWorkspace = {
      async execute(name, args) {
        if (name !== "run_command" || args.command !== expectedCommand) throw new Error("Unexpected validation command")
        commands.push(String(args.command))
        const result = await runner.runBounded(process.execPath, ["-e", `const read=p=>require('fs').readFileSync(p,'utf8');${task.check}`])
        return { ...result, success: result.successful }
      },
      async inspectChanges() { const diff = await exportPatch(runner, base); return { diff, status: "fixture", digest: createHash("sha256").update(JSON.stringify([base, diff])).digest("hex") } },
      async savePatch(expected) { const state = await this.inspectChanges(); if (state.digest !== expected) throw new Error("Stale proof"); exports++; return "fixture.patch" },
      async close() {},
    }
    const operation = { args: {}, validationCommands: [expectedCommand] }
    expect((await executeRepositoryOperation({ ...operation, name: "repository_verify" }, workspace)).success).toBe(false)
    expect((await executeRepositoryOperation({ ...operation, name: "repository_finish" }, workspace)).success).toBe(false)
    expect(exports).toBe(0)
    for (const [name, text] of Object.entries(task.edits)) await writeFile(join(root, name), text)
    const verified = await executeRepositoryOperation({ ...operation, name: "repository_verify" }, workspace)
    expect(verified.success).toBe(true)
    const data = verified.data as { verifiedDigest: string; commands: Record<string, unknown>[] }
    const finished = await executeRepositoryOperation({ ...operation, name: "repository_finish", verified: { digest: data.verifiedDigest, commands: data.commands } }, workspace)
    expect(finished.success).toBe(true)
    expect(exports).toBe(1)
    for (const name of Object.keys(task.edits)) {
      expect((finished.data as { diff: string }).diff).toContain(name)
      expect(await readFile(join(root, name), "utf8")).toBe(task.edits[name as keyof typeof task.edits]!)
    }
    expect(commands).toEqual([expectedCommand, expectedCommand])
  } finally { await rm(root, { recursive: true, force: true }) }
})

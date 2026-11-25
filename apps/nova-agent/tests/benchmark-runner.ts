import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdir, writeFile, readFile, lstat, readlink } from "node:fs/promises"
import { createHash } from "node:crypto"
import { cpus, platform, arch } from "node:os"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { summarizeBenchmark, type BenchmarkSample } from "../lib/benchmark"

const exec = promisify(execFile)
const root = fileURLToPath(new URL("../../../", import.meta.url))
const args = process.argv.slice(2)
if (args.length !== 4 || args[0] !== "--repeat" || args[2] !== "--output") throw new Error("Usage: bun run benchmark --repeat 3 --output /absolute/report.json")
const repeat = Number(args[1])
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 20) throw new Error("Repeat must be 1–20")
const output = resolve(args[3])
if (output.startsWith(root)) throw new Error("Write benchmark evidence outside the repository, e.g. ~/.capy/work/nova-bench/report.json")
const revision = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim()
const diff = (await exec("git", ["diff", "HEAD", "--"], { cwd: root, maxBuffer: 4_000_000 })).stdout
const status = (await exec("git", ["status", "--porcelain"], { cwd: root })).stdout
const workingTree = createHash("sha256").update(diff).update(status)
const untracked = (await exec("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: root })).stdout.split("\0").filter(Boolean).sort()
for (const path of untracked) {
  const absolute = resolve(root, path)
  const entry = await lstat(absolute)
  workingTree.update(path).update("\0")
  workingTree.update(entry.isSymbolicLink() ? await readlink(absolute) : await readFile(absolute)).update("\0")
}
const scenarios = [
  { id: "changelog-contract", path: "apps/web/modules/nova/eve/task-quality.test.ts", filter: "changelog version update", cwd: "apps/web" },
  { id: "test-repair-contract", path: "apps/web/modules/nova/eve/task-quality.test.ts", filter: "failing test repair", cwd: "apps/web" },
  { id: "multi-file-contract", path: "apps/web/modules/nova/eve/task-quality.test.ts", filter: "multi-file change", cwd: "apps/web" },
  { id: "recovery-contracts", path: "apps/web/modules/nova/eve/worker.test.ts", filter: "", cwd: "apps/web" },
]
const samples: BenchmarkSample[] = []
for (let attempt = 1; attempt <= repeat; attempt++) {
  for (const scenario of scenarios) {
    const started = performance.now()
    let exitCode: number | null = 0
    let timedOut = false
    try {
      await exec(process.execPath, ["test", resolve(root, scenario.path), ...(scenario.filter ? ["-t", scenario.filter] : [])], { cwd: resolve(root, scenario.cwd), timeout: 60_000, maxBuffer: 1_000_000 })
    } catch (error) {
      const failure = error as { code?: unknown; killed?: boolean }
      exitCode = typeof failure.code === "number" ? failure.code : null
      timedOut = failure.killed === true
    }
    samples.push({ scenario: scenario.id, attempt, durationMs: Math.round(performance.now() - started), exitCode, timedOut })
  }
}
const report = {
  version: 1, kind: "offline-contract-benchmark", recordedAt: new Date().toISOString(), revision,
  dirty: Boolean(status), workingTreeHash: workingTree.digest("hex"),
  environment: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model ?? "unknown", cpuCount: cpus().length, bun: Bun.version },
  conditions: "Sequential fresh Bun subprocesses; shared OS filesystem caches; no cold-cache guarantee; scripted fixture edits and mocked provider/database boundaries",
  scenarios, samples, summaries: summarizeBenchmark(samples),
  providerCostUsd: null, liveTaskSuccessRate: null,
  rollout: { eligible: false, blockers: ["Production Workflow durability/redeploy validation missing", "Real-account model task evaluation missing", "Paid sandbox billing/cleanup evaluation missing", "No live task/cost comparison baseline"] },
}
await mkdir(dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 })
console.log(JSON.stringify({ output, summaries: report.summaries, rolloutEligible: false }, null, 2))
if (samples.some((sample) => sample.exitCode !== 0 || sample.timedOut)) process.exitCode = 1

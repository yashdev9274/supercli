import { Command } from "commander"
import { mkdir, chmod, lstat, realpath } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, resolve } from "node:path"
import { createInterface } from "node:readline/promises"

import { spawnCodex } from "../../nova/codex-rpc"
import { resolveCodexProfile } from "../../nova/profile"
import { LocalCodexRuntime } from "../../nova/runtime"
import { localOrigin, startCompanion } from "../../nova/server"

export const novaCommand = new Command("nova").description("Local Nova integrations")
novaCommand.command("connect")
  .description("Pair locally hosted Nova with your existing Codex login (read-only)")
  .requiredOption("--origin <origin>", "Exact local Nova origin, e.g. http://localhost:3003")
  .option("--port <port>", "Loopback companion port", "43127")
  .option("--workspace <directory>", "Read-only workspace", process.cwd())
  .option("--profile <mode>", "Codex account profile: existing or isolated", "existing")
  .action(async (options: { origin: string; port: string; workspace: string; profile: string }) => {
    const profile = resolveCodexProfile(options.profile)
    const origin = localOrigin(options.origin)
    const port = Number(options.port)
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid port")
    if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Pairing requires an interactive terminal")
    const workspace = await realpath(resolve(options.workspace))
    if (!(await lstat(workspace)).isDirectory()) throw new Error("Workspace must be a directory")
    const prompt = createInterface({ input: process.stdin, output: process.stdout })
    let answer: string
    try {
      answer = await prompt.question(`Allow ${origin} to control local Codex in ${workspace} (read-only), using the ${profile.mode} profile at ${profile.path}? Existing Codex configuration may include integrations. [y/N] `)
    } finally { prompt.close() }
    if (answer.trim().toLowerCase() !== "y") return
    if (profile.mode === "isolated") {
      await mkdir(profile.path, { recursive: true, mode: 0o700 })
      const metadata = await lstat(profile.path)
      if (metadata.isSymbolicLink() || !metadata.isDirectory() || (typeof process.getuid === "function" && metadata.uid !== process.getuid())) {
        throw new Error("Unsafe Nova Codex profile directory")
      }
      await chmod(profile.path, 0o700)
    }
    // Do not create, chmod, inspect or copy the shared profile's credential files.
    // Launch outside the selected workspace to avoid startup project config.
    const rpc = spawnCodex(profile.path, homedir(), profile.mode)
    const runtime = new LocalCodexRuntime(rpc, workspace, basename(workspace), profile.mode)
    let companion: Awaited<ReturnType<typeof startCompanion>>
    try {
      await runtime.status()
      companion = await startCompanion({ origin, port, runtime })
    } catch {
      runtime.close()
      throw new Error("Could not start Codex. Install/update the Codex CLI and retry.")
    }
    process.stdout.write(`Codex detected (${profile.mode} profile). Companion: http://127.0.0.1:${companion.port}\nOpen Nova Settings → Models. Pairing code (5 minutes, one use): ${companion.pairingCode}\n${profile.mode === "existing" ? "Reusing your Codex login. If not signed in, run codex login with the same CODEX_HOME, then restart this companion. Nova cannot sign out your shared CLI account." : "Credentials remain in the dedicated Nova profile."}\nPress Ctrl+C to stop.\n`)
    let stopping = false
    const stop = () => {
      if (stopping) return
      stopping = true
      void companion.close().finally(() => { process.exitCode = 0 })
    }
    process.once("SIGINT", stop)
    process.once("SIGTERM", stop)
  })

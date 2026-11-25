import { Command } from "commander"
import { mkdir, chmod, lstat, realpath } from "node:fs/promises"
import { homedir } from "node:os"
import { basename, resolve } from "node:path"
import { createInterface } from "node:readline/promises"

import { spawnCodex } from "../../nova/codex-rpc"
import { resolveCodexProfile } from "../../nova/profile"
import { LocalCodexRuntime } from "../../nova/runtime"
import { localOrigin, startCompanion } from "../../nova/server"
import { createEveClient, eveOrigin } from "../../nova/eve-client"
import { getStoredToken } from "../../lib/token"

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

type EveOptions = {
  origin: string
  session: string
  provider: string
  model: string
  message: string
  effort?: string
  clientMessageId?: string
}

async function eveClient(origin: string) {
  eveOrigin(origin)
  const token = await getStoredToken()
  if (typeof token?.access_token !== "string") throw new Error("Sign in with supercode login first")
  return createEveClient({ origin, token: token.access_token })
}

async function displayEveRun(client: ReturnType<typeof createEveClient>, sessionId: string, runId: string, signal: AbortSignal) {
  for await (const { event } of client.follow(sessionId, runId, signal)) {
    if (event.type === "text" && typeof event.content === "string") process.stdout.write(event.content)
    if (event.type === "reasoning" && typeof event.content === "string") process.stderr.write(event.content)
    if (event.type === "error") {
      process.stderr.write("Nova Eve reported a run error; inspect the run in Nova\n")
      process.exitCode = 1
    }
  }
  process.stdout.write("\n")
}

novaCommand.command("eve")
  .description("Explicitly start a read-only Eve canary turn in an existing Nova session")
  .requiredOption("--origin <origin>", "Trusted Nova HTTPS origin or loopback HTTP origin")
  .requiredOption("--session <id>", "Existing Nova session ID (not a legacy CLI conversation ID)")
  .requiredOption("--provider <provider>", "Exact connected Nova provider")
  .requiredOption("--model <model>", "Exact Nova model; no fallback")
  .requiredOption("--message <message>", "Read-only chat message")
  .option("--effort <effort>", "Explicit reasoning effort")
  .option("--client-message-id <id>", "Admission deduplication ID; reuse to retry the same message")
  .action(async (options: EveOptions) => {
    if (options.effort && !["none", "minimal", "low", "medium", "high", "xhigh"].includes(options.effort)) throw new Error("Invalid reasoning effort")
    const client = await eveClient(options.origin)
    const observer = new AbortController()
    const stop = () => observer.abort()
    process.once("SIGINT", stop)
    process.once("SIGTERM", stop)
    const clientMessageId = options.clientMessageId ?? crypto.randomUUID()
    process.stderr.write(`Eve read-only canary. Admission ID: ${clientMessageId}\n`)
    try {
      const admission = await client.admit(options.session, {
        content: options.message,
        clientMessageId,
        provider: options.provider,
        model: options.model,
        ...(options.effort ? { effort: options.effort } : {}),
      }, observer.signal)
      process.stderr.write(`Eve run: ${admission.runId}\n`)
      await displayEveRun(client, options.session, admission.runId, observer.signal)
    } catch (error) {
      if (!observer.signal.aborted) throw error
      process.stderr.write("Observation stopped. The run continues if admitted; use nova eve-cancel to cancel explicitly.\n")
    } finally {
      process.removeListener("SIGINT", stop)
      process.removeListener("SIGTERM", stop)
    }
  })

novaCommand.command("eve-follow")
  .description("Observe an existing Eve canary run without admitting a new turn")
  .requiredOption("--origin <origin>", "Trusted Nova HTTPS origin or loopback HTTP origin")
  .requiredOption("--session <id>", "Nova session ID")
  .requiredOption("--run <id>", "Existing Eve run ID")
  .action(async (options: { origin: string; session: string; run: string }) => {
    const client = await eveClient(options.origin)
    const observer = new AbortController()
    const stop = () => observer.abort()
    process.once("SIGINT", stop)
    process.once("SIGTERM", stop)
    try {
      await displayEveRun(client, options.session, options.run, observer.signal)
    } catch (error) {
      if (!observer.signal.aborted) throw error
      process.stderr.write("Observation stopped. The run continues; use nova eve-cancel to cancel explicitly.\n")
    } finally {
      process.removeListener("SIGINT", stop)
      process.removeListener("SIGTERM", stop)
    }
  })

novaCommand.command("eve-cancel")
  .description("Explicitly cancel an Eve canary run")
  .requiredOption("--origin <origin>", "Trusted Nova HTTPS origin or loopback HTTP origin")
  .requiredOption("--session <id>", "Nova session ID")
  .requiredOption("--run <id>", "Eve run ID to cancel")
  .action(async (options: { origin: string; session: string; run: string }) => {
    const client = await eveClient(options.origin)
    await client.cancel(options.session, options.run)
    process.stderr.write("Nova Eve cancellation requested.\n")
  })

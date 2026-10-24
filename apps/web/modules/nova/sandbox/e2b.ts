import { CommandExitError, Sandbox, type SandboxNetworkOpts } from "e2b"

import { MAX_OUTPUT_BYTES, VM_MS, WORKSPACE } from "./policy"

export type CommandOptions = { signal?: AbortSignal; timeoutMs?: number; cwd?: string; maxBytes?: number }
export type CommandResult = { successful: boolean; exitCode: number; stdout: string; stderr: string; truncated: boolean }
export type CommandRunner = { runBounded: (cmd: string, args: string[], options?: CommandOptions) => Promise<CommandResult> }

export function e2bCredentials() {
  const apiKey = process.env.E2B_API_KEY
  if (!apiKey?.startsWith("e2b_")) throw new Error("Configure a valid E2B_API_KEY before enabling E2B")
  return { apiKey }
}

export function e2bNetwork(domains: string[] = []): SandboxNetworkOpts {
  return {
    allowPublicTraffic: false,
    allowOut: domains,
    denyOut: ({ allTraffic }) => [allTraffic],
    rules: Object.fromEntries(domains.map((domain) => [domain, [{ transform: { headers: { Host: domain } } }]])),
  }
}

const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

export class E2BWorkspace implements CommandRunner {
  constructor(public sandbox: Sandbox) {}

  async runBounded(cmd: string, args: string[], options: CommandOptions = {}): Promise<CommandResult> {
    options.signal?.throwIfAborted()
    const controller = new AbortController()
    const signal = AbortSignal.any([controller.signal, ...(options.signal ? [options.signal] : []), AbortSignal.timeout(options.timeoutMs ?? 60_000)])
    let stdout = ""
    let stderr = ""
    let bytes = 0
    let truncated = false
    const capture = (stream: "stdout" | "stderr") => (data: string) => {
      bytes += Buffer.byteLength(data)
      if (bytes > (options.maxBytes ?? MAX_OUTPUT_BYTES)) {
        truncated = true
        controller.abort()
        return
      }
      if (stream === "stdout") stdout += data
      else stderr += data
    }
    let handle: Awaited<ReturnType<Sandbox["commands"]["run"]>> | undefined
    let finished = false
    try {
      handle = await this.sandbox.commands.run([cmd, ...args].map(quote).join(" "), {
        background: true, cwd: options.cwd ?? WORKSPACE, timeoutMs: options.timeoutMs ?? 60_000,
        signal, requestTimeoutMs: 10_000,
        envs: { GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_PAGER: "cat" },
        onStdout: capture("stdout"), onStderr: capture("stderr"),
      })
      if (!("wait" in handle)) throw new Error("E2B did not return a command handle")
      const command = handle
      // Bound waiting independently of SDK stream cancellation behavior.
      const result = await new Promise<Awaited<ReturnType<typeof command.wait>>>((resolve, reject) => {
        const abort = () => reject(signal.reason ?? new Error("E2B command aborted"))
        signal.addEventListener("abort", abort, { once: true })
        command.wait().then(resolve, reject).finally(() => signal.removeEventListener("abort", abort))
        if (signal.aborted) abort()
      })
      finished = true
      return { successful: result.exitCode === 0 && !truncated, exitCode: result.exitCode, stdout, stderr, truncated }
    } catch (error) {
      if (error instanceof CommandExitError) {
        finished = true
        return { successful: false, exitCode: error.exitCode, stdout, stderr, truncated }
      }
      if (truncated) return { successful: false, exitCode: -1, stdout, stderr, truncated }
      throw error
    } finally {
      if (!finished && handle && "pid" in handle) {
        await this.sandbox.commands.kill(handle.pid, { requestTimeoutMs: 5000, signal: AbortSignal.timeout(5000) }).catch(() => {})
        if ("disconnect" in handle) await handle.disconnect().catch(() => {})
      }
    }
  }

  async stop(): Promise<void> {
    let policyFailed = false
    try {
      await this.sandbox.updateNetwork(e2bNetwork(), { signal: AbortSignal.timeout(10_000) })
    } catch {
      policyFailed = true
    }
    // Filesystem-only pause terminates every background process on resume.
    // Never silently substitute a memory-preserving pause if unsupported.
    await this.sandbox.pause({ mode: "filesystem", signal: AbortSignal.timeout(60_000) })
    if (policyFailed) throw new Error("E2B workspace paused; network cleanup requires recovery")
  }

  async resume(signal?: AbortSignal): Promise<void> {
    this.sandbox = await Sandbox.connect(this.sandbox.sandboxId, { ...e2bCredentials(), timeoutMs: VM_MS, onResume: "reboot", signal, requestTimeoutMs: 60_000 })
  }
}

export async function createE2BWorkspace(name: string, signal: AbortSignal): Promise<E2BWorkspace> {
  const sandbox = await Sandbox.create(process.env.NOVA_E2B_TEMPLATE || "base", {
    ...e2bCredentials(), timeoutMs: VM_MS, signal, requestTimeoutMs: 60_000,
    metadata: { app: "nova", workspace: name },
    network: e2bNetwork(),
    lifecycle: { onTimeout: { action: "pause", mode: "filesystem" }, autoResume: false },
  })
  const workspace = new E2BWorkspace(sandbox)
  try {
    const identity = await workspace.runBounded("/usr/bin/id", [], { cwd: "/", signal, timeoutMs: 10_000 })
    const uid = /^uid=(\d+)\b/.exec(identity.stdout)?.[1]
    const gid = /\bgid=(\d+)\b/.exec(identity.stdout)?.[1]
    if (!identity.successful || !uid || !gid) throw new Error("Could not determine E2B workspace owner")
    // Only this fixed bootstrap runs as root, before any repository is extracted.
    // Agent commands continue using the template's default unprivileged user.
    await sandbox.commands.run(`/usr/bin/install -d -m 0755 -o ${uid} -g ${gid} ${quote(WORKSPACE)}`, {
      user: "root", cwd: "/", signal, timeoutMs: 10_000, requestTimeoutMs: 15_000,
    })
    return workspace
  } catch (error) {
    await sandbox.kill({ signal: AbortSignal.timeout(10_000), requestTimeoutMs: 10_000 }).catch(() => {})
    throw error
  }
}

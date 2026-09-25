import { spawn } from "node:child_process"
import { mkdtemp, open } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

export interface CommandOptions {
  command: string
  cwd: string
  timeout: number
  signal?: AbortSignal
  onOutput?: (stream: "stdout" | "stderr", text: string) => void
}

export async function executeCommand(options: CommandOptions) {
  options.signal?.throwIfAborted()
  const directory = await mkdtemp(join(tmpdir(), "supercode-command-"))
  const logPath = join(directory, "output.log")
  const log = await open(logPath, "wx", 0o600)
  const started = Date.now()
  let writes = Promise.resolve()
  let logBytes = 0
  let logTruncated = false
  let logError = false
  const MAX_LOG = 10_000_000
  const MAX_PREVIEW = 32000
  return new Promise<{
    success: boolean; exitCode: number | null; signal: string | null
    stdout: string; stderr: string; timedOut: boolean; cancelled: boolean
    durationMs: number; cwd: string; logPath: string; truncated: boolean; logTruncated: boolean; logError: boolean; summary: string
  }>((resolve) => {
    let stdout = ""
    let stderr = ""
    let truncated = false
    let timedOut = false
    let cancelled = false
    let done = false
    let escalation: ReturnType<typeof setTimeout> | undefined
    const grouped = process.platform !== "win32"
    const child = spawn(grouped ? "/bin/sh" : (process.env.ComSpec || "cmd.exe"), grouped ? ["-c", options.command] : ["/d", "/s", "/c", options.command], {
      cwd: options.cwd, detached: grouped,
      env: { ...process.env, CI: "true", PAGER: "cat", GIT_PAGER: "cat", GIT_TERMINAL_PROMPT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    })
    const kill = (signal: NodeJS.Signals) => {
      try {
        if (grouped && child.pid) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch { /* process already exited */ }
    }
    const stop = () => {
      kill("SIGTERM")
      if (!escalation) escalation = setTimeout(() => kill("SIGKILL"), 1000)
    }
    const abort = () => { cancelled = true; stop() }
    const timer = setTimeout(() => { timedOut = true; stop() }, options.timeout)
    options.signal?.addEventListener("abort", abort, { once: true })
    if (options.signal?.aborted) abort()
    const output = (stream: "stdout" | "stderr", text: string) => {
      if (stream === "stdout") { stdout += text; if (stdout.length > MAX_PREVIEW) { stdout = stdout.slice(-MAX_PREVIEW); truncated = true } }
      else { stderr += text; if (stderr.length > MAX_PREVIEW) { stderr = stderr.slice(-MAX_PREVIEW); truncated = true } }
      const bytes = Buffer.from(`[${stream}] ${text}`)
      const kept = bytes.subarray(0, Math.max(0, MAX_LOG - logBytes))
      logBytes += kept.length
      if (kept.length < bytes.length) logTruncated = true
      if (kept.length) writes = writes.then(async () => { await log.write(kept) }).catch(() => { logError = true })
      try { options.onOutput?.(stream, text) } catch { /* presentation cannot break execution */ }
    }
    child.stdout.setEncoding("utf8")
    child.stderr.setEncoding("utf8")
    child.stdout.on("data", (text: string) => output("stdout", text))
    child.stderr.on("data", (text: string) => output("stderr", text))
    const finish = async (exitCode: number | null, signal: string | null, error?: Error) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (escalation) { kill("SIGKILL"); clearTimeout(escalation) }
      options.signal?.removeEventListener("abort", abort)
      if (error) stderr = `${stderr}\n${error.message}`.slice(-MAX_PREVIEW)
      await writes
      await log.close().catch(() => { logError = true })
      const success = exitCode === 0 && !signal && !timedOut && !cancelled && !error
      const summary = timedOut ? "Command timed out" : cancelled ? "Command cancelled" : error ? "Command failed to start" : signal ? `Command terminated by ${signal}` : success ? "Command completed successfully" : `Command failed with exit code ${exitCode}`
      resolve({ success, exitCode, signal, stdout, stderr, timedOut, cancelled,
        durationMs: Date.now() - started, cwd: options.cwd, logPath, truncated, logTruncated, logError, summary })
    }
    child.on("error", (error) => { void finish(null, null, error) })
    child.on("close", (code, signal) => { void finish(code, signal) })
  })
}

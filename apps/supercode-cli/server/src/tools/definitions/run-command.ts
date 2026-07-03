import { z } from "zod"
import { spawn } from "node:child_process"
import path from "node:path"
import { resolvePath } from "../../lib/workspace"
import { serialize, ok, fail } from "../../cli/ai/tool-result"


const runCommandSchema = z.object({
  command: z.string().describe("Shell command to execute (e.g. 'npm install', 'npm run build', 'git status')"),
  description: z
    .string()
    .optional()
    .describe("Purpose of this command (for display in permission prompt)"),
  timeout: z
    .number()
    .optional()
    .default(300_000)
    .describe("Timeout in milliseconds (default: 300000 — increase for installs/scaffolding)"),
  cwd: z
    .string()
    .optional()
    .describe("Working directory RELATIVE to workspace root (defaults to workspace root). Do NOT use 'cd' in the command — use this param instead."),
  interactive: z
    .boolean()
    .optional()
    .default(false)
    .describe("Set to true if the command requires interactive input (prompts, selections). When true, stdin stays open and 'y' is piped on each prompt."),
  autoYes: z
    .boolean()
    .optional()
    .default(true)
    .describe("Auto-answer 'y' to prompts. Set false to let the user interact directly."),
})

export type RunCommandArgs = z.infer<typeof runCommandSchema>

export const runCommandTool = {
  description:
    `Execute a shell command in the workspace. Use this to install dependencies, run builds, start dev servers, run tests, or any other terminal operation.

IMPORTANT RULES:
  • Do NOT use 'cd' in commands — use the 'cwd' parameter instead. Example: run_command({ command: "npm install", cwd: "packages/foo" })
  • For scaffolding (npm create, npx), set CI=true is already in env. Use the 'cwd' parameter, NOT 'cd &&' chains.
  • If the command may prompt interactively, set interactive: true so stdin stays open.
  • For any npm/npx scaffolding command, prefer: npx --yes <package> (avoids install prompt)
  • Check exitCode in the result — zero means success.`,
  parameters: runCommandSchema,
  execute: async ({ command, timeout, cwd: subdir, interactive, autoYes }: RunCommandArgs) =>
    serialize(async () => {
      const workspaceRoot = process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()

      let resolvedCwd = workspaceRoot
      if (subdir) {
        resolvedCwd = resolvePath(subdir)
      }

      process.stdout.write(`$ ${command}\n`)

      return new Promise<string>((resolvePromise) => {
        const stdoutChunks: string[] = []
        const stderrChunks: string[] = []
        let killed = false
        let done = false

        const child = spawn("/bin/sh", ["-c", command], {
          cwd: resolvedCwd,
          env: {
            ...process.env,
            PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin",
            CI: "true",
            npm_config_yes: "true",
            YES: "1",
            NONINTERACTIVE: "1",
            TERM: "dumb",
            PAGER: "cat",
            GIT_TERMINAL_PROMPT: "0",
            HOMEBREW_NO_AUTO_UPDATE: "1",
          },
          stdio: ["pipe", "pipe", "pipe"],
        })

        if (child.stdin) {
          if (autoYes) {
            if (interactive) {
              const pipeYes = () => {
                try {
                  child.stdin!.write("y\n")
                } catch {}
              }
              const interval = setInterval(pipeYes, 500)
              child.on("close", () => clearInterval(interval))
            } else {
              child.stdin.write("y\n".repeat(20))
              child.stdin.end()
            }
          } else {
            if (interactive && process.stdin.isTTY) {
              process.stdin.pipe(child.stdin)
            } else {
              child.stdin.end()
            }
          }
        }

        const timer = setTimeout(() => {
          killed = true
          child.kill("SIGTERM")
        }, timeout)

        child.stdout?.on("data", (data: Buffer) => {
          const text = data.toString()
          stdoutChunks.push(text)
          process.stdout.write(text.replace(/\n/g, "\r\n"))
        })

        child.stderr?.on("data", (data: Buffer) => {
          const text = data.toString()
          stderrChunks.push(text)
          process.stderr.write(text.replace(/\n/g, "\r\n"))
        })

        child.on("close", (code) => {
          if (done) return
          done = true
          clearTimeout(timer)

          process.stdout.write("\r\n")

          const stdout = stdoutChunks.join("")
          const stderr = stderrChunks.join("")
          const exitCode = code ?? 0

          const result: Record<string, unknown> = {
            exitCode,
            stdout,
            stderr,
            success: exitCode === 0,
            cancelled: killed,
          }

          if (killed) {
            result.signal = "SIGTERM"
            result.summary = `Command timed out after ${(timeout / 1000).toFixed(0)}s`
          } else if (exitCode !== 0) {
            result.summary = `Command failed with exit code ${exitCode}`
          } else {
            result.summary = "Command completed successfully"
          }

          resolvePromise(ok(result))
        })

        child.on("error", (err) => {
          if (done) return
          done = true
          clearTimeout(timer)
          process.stdout.write("\r\n")
          resolvePromise(ok({
            exitCode: -1,
            stdout: "",
            stderr: err.message,
            success: false,
            cancelled: true,
            summary: `Failed to start command: ${err.message}`,
          }))
        })
      })
    }),
}

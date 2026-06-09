import { z } from "zod"
import { exec } from "node:child_process"
import path from "node:path"

const runCommandSchema = z.object({
  command: z.string().describe("Shell command to execute (e.g. 'npm install', 'npm run build', 'git status')"),
  description: z
    .string()
    .optional()
    .describe("Purpose of this command (for display in permission prompt)"),
  timeout: z
    .number()
    .optional()
    .default(120_000)
    .describe("Timeout in milliseconds (default: 120000)"),
  cwd: z
    .string()
    .optional()
    .describe("Working directory relative to workspace root (defaults to workspace root)"),
})

export type RunCommandArgs = z.infer<typeof runCommandSchema>

export const runCommandTool = {
  description:
    "Execute a shell command in the workspace. Use this to install dependencies, run builds, start dev servers, run tests, or any other terminal operation.",
  parameters: runCommandSchema,
  execute: async ({ command, timeout, cwd: subdir }: RunCommandArgs) => {
    const workspaceRoot = process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()

    let resolvedCwd = workspaceRoot
    if (subdir) {
      resolvedCwd = path.resolve(workspaceRoot, subdir)
      if (!resolvedCwd.startsWith(workspaceRoot)) {
        throw new Error(`Working directory "${subdir}" is outside workspace root`)
      }
    }

    return new Promise((resolve) => {
      const child = exec(
        command,
        {
          cwd: resolvedCwd,
          encoding: "utf-8",
          timeout,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, PATH: process.env.PATH || "/usr/local/bin:/usr/bin:/bin" },
        },
        (error, stdout, stderr) => {
          const result: Record<string, unknown> = {
            exitCode: error?.code ?? 0,
            stdout: stdout || "",
            stderr: stderr || "",
          }

          if (error && error.killed) {
            result.signal = error.signal || "SIGTERM"
            result.stderr = (result.stderr as string) + `\nCommand timed out after ${timeout}ms`
          }

          if (error && error.code === undefined && !error.killed) {
            result.exitCode = -1
            result.stderr = (result.stderr as string) + `\n${error.message}`
          }

          resolve(JSON.stringify(result))
        },
      )
    })
  },
}

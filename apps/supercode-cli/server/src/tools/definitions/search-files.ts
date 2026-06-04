import { z } from "zod"
import path from "node:path"

const searchFilesSchema = z.object({
  pattern: z.string().describe("Text or regex pattern to search for"),
  include: z.string().optional().describe("File glob pattern to narrow search (e.g. '*.ts', '*.{tsx,jsx}')"),
  maxResults: z.number().optional().default(20).describe("Maximum number of results to return"),
})

export type SearchFilesArgs = z.infer<typeof searchFilesSchema>

export const searchFilesTool = {
  description: "Search for text patterns across workspace files. Use this to find relevant code, function definitions, imports, or any text in the codebase.",
  parameters: searchFilesSchema,
  execute: async ({ pattern, include, maxResults }: SearchFilesArgs) => {
    const execSync = (await import("node:child_process")).execSync
    const workspaceRoot = process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()

    let cmd = `grep -rn --binary-files=without-match`
    const includeGlob = include ?? ""
    if (includeGlob) {
      cmd += ` --include="${includeGlob}"`
    }
    cmd += ` -m 1 "${pattern}" "${workspaceRoot}"`
    cmd += ` 2>/dev/null | head -${maxResults ?? 20}`

    try {
      const output = execSync(cmd, { encoding: "utf-8", maxBuffer: 1024 * 1024 })
      if (!output.trim()) return "No matches found."

      const lines = output.trim().split("\n").slice(0, maxResults ?? 20)
      return lines.map((line: string) => {
        const parts = line.split(":", 2)
        const filePath = parts[0]!
        if (parts.length === 2) {
          const relPath = path.relative(workspaceRoot, filePath)
          return `${relPath}:${parts[1]!}`
        }
        return line
      }).join("\n")
    } catch {
      return "No matches found."
    }
  },
}

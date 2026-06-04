import { z } from "zod"
import path from "node:path"

const readFileSchema = z.object({
  path: z.string().describe("Relative path from workspace root (e.g. 'src/index.ts', 'package.json')"),
  maxLines: z.number().optional().describe("Maximum number of lines to read (omit for full file)"),
})

export type ReadFileArgs = z.infer<typeof readFileSchema>

export const readFileTool = {
  description: "Read the contents of a file within the workspace. Use this to examine source code, configuration files, or any file the user asks about.",
  parameters: readFileSchema,
  execute: async ({ path: filePath, maxLines }: ReadFileArgs) => {
    const workspaceRoot = process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()
    const fullPath = path.resolve(workspaceRoot, filePath)

    if (!fullPath.startsWith(workspaceRoot)) {
      throw new Error(`Path "${filePath}" is outside workspace root`)
    }

    const fs = await import("node:fs/promises")
    const content = await fs.readFile(fullPath, "utf-8")

    if (maxLines !== undefined) {
      const lines = content.split("\n")
      const sliced = lines.slice(0, maxLines)
      if (lines.length > maxLines) {
        sliced.push(`\n... (${lines.length - maxLines} more lines)` as any)
      }
      return sliced.join("\n")
    }

    return content
  },
}

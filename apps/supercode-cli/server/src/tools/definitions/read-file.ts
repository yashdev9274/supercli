import { z } from "zod"
import { readFile } from "node:fs/promises"
import { resolvePath, WorkspaceError } from "../../lib/workspace"
import { serialize, ok, fail } from "../../cli/ai/tool-result"

const readFileSchema = z.object({
  path: z.string().describe("Relative path from workspace root (e.g. 'src/index.ts', 'package.json')"),
  maxLines: z.number().optional().describe("Maximum number of lines to read (omit for full file)"),
  description: z.string().optional().describe("What to look for (for display)"),
})

export type ReadFileArgs = z.infer<typeof readFileSchema>

export const readFileTool = {
  description: "Read the contents of a file within the workspace. Use this to examine source code, configuration files, or any file the user asks about.",
  parameters: readFileSchema,
  execute: async ({ path: filePath, maxLines }: ReadFileArgs) =>
    serialize(async () => {
      const fullPath = resolvePath(filePath)

      const content = await readFile(fullPath, "utf-8")

      if (maxLines !== undefined) {
        const lines = content.split("\n")
        const sliced = lines.slice(0, maxLines)
        if (lines.length > maxLines) {
          sliced.push(`\n... (${lines.length - maxLines} more lines)`)
        }
        return ok({ path: filePath, content: sliced.join("\n"), totalLines: lines.length })
      }

      return ok({ path: filePath, content, totalLines: content.split("\n").length })
    }),
}

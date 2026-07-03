import { z } from "zod"
import { readFile } from "node:fs/promises"
import { resolvePath, fileExists } from "../../lib/workspace"
import { serialize, ok } from "../../cli/ai/tool-result"

const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md", "README.md", "CONTRIBUTING.md"]

const readInstructionsSchema = z.object({
  path: z.string().optional().describe("Specific instruction file to read (omit to read all known files: AGENTS.md, CLAUDE.md, README.md, CONTRIBUTING.md)"),
})

export type ReadInstructionsArgs = z.infer<typeof readInstructionsSchema>

export const readInstructionsTool = {
  description: "Read project instruction files (AGENTS.md, CLAUDE.md, README.md) from the workspace root. Use this at the start of a session to understand project conventions, build commands, code style, and workflow preferences.",
  parameters: readInstructionsSchema,
  execute: async ({ path: specificPath }: ReadInstructionsArgs) =>
    serialize(async () => {
      if (specificPath) {
        const fullPath = resolvePath(specificPath)
        if (await fileExists(fullPath)) {
          const content = await readFile(fullPath, "utf-8")
          return ok({ files: [{ name: specificPath, content }] })
        }
        return ok({ files: [], message: `No file found at "${specificPath}"` })
      }

      const results: Array<{ name: string; content: string }> = []

      for (const name of INSTRUCTION_FILES) {
        const fullPath = resolvePath(name)
        if (await fileExists(fullPath)) {
          const content = await readFile(fullPath, "utf-8")
          results.push({ name, content })
        }
      }

      if (results.length === 0) {
        return ok({ files: [], message: "No instruction files found in workspace root." })
      }

      return ok({ files: results })
    }),
}

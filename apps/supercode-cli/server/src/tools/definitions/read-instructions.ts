import { z } from "zod"
import path from "node:path"
import { readFile, access } from "node:fs/promises"

const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md", "README.md", "CONTRIBUTING.md"]

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

const readInstructionsSchema = z.object({
  path: z.string().optional().describe("Specific instruction file to read (omit to read all known files: AGENTS.md, CLAUDE.md, README.md, CONTRIBUTING.md)"),
})

export type ReadInstructionsArgs = z.infer<typeof readInstructionsSchema>

export const readInstructionsTool = {
  description: "Read project instruction files (AGENTS.md, CLAUDE.md, README.md) from the workspace root. Use this at the start of a session to understand project conventions, build commands, code style, and workflow preferences.",
  parameters: readInstructionsSchema,
  execute: async ({ path: specificPath }: ReadInstructionsArgs) => {
    const workspaceRoot = process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()
    const results: string[] = []

    if (specificPath) {
      const fullPath = path.resolve(workspaceRoot, specificPath)
      if (!fullPath.startsWith(workspaceRoot)) {
        throw new Error(`Path "${specificPath}" is outside workspace root`)
      }
      if (await fileExists(fullPath)) {
        const content = await readFile(fullPath, "utf-8")
        return `# ${specificPath}\n\n${content}`
      }
      return `No file found at "${specificPath}"`
    }

    for (const name of INSTRUCTION_FILES) {
      const fullPath = path.resolve(workspaceRoot, name)
      if (await fileExists(fullPath)) {
        const content = await readFile(fullPath, "utf-8")
        results.push(`# ${name}\n\n${content}`)
      }
    }

    if (results.length === 0) {
      return "No instruction files found in workspace root."
    }

    return results.join("\n\n---\n\n")
  },
}

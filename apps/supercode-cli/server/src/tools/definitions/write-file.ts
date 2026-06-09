import { z } from "zod"
import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"

const MAX_FILE_SIZE = 1_000_000

const writeFileSchema = z.object({
  path: z.string().describe("Relative path from workspace root (e.g. 'src/App.jsx', 'package.json')"),
  content: z.string().describe("Complete file content to write"),
  description: z
    .string()
    .optional()
    .describe("Brief description of what this file does (for display)"),
})

export type WriteFileArgs = z.infer<typeof writeFileSchema>

export const writeFileTool = {
  description:
    "Create a new file or overwrite an existing file in the workspace. Use this to create components, add features, fix bugs, or modify configuration files.",
  parameters: writeFileSchema,
  execute: async ({ path: filePath, content }: WriteFileArgs) => {
    const workspaceRoot = process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()
    const fullPath = path.resolve(workspaceRoot, filePath)

    if (!fullPath.startsWith(workspaceRoot)) {
      throw new Error(`Path "${filePath}" is outside workspace root`)
    }

    if (content.length > MAX_FILE_SIZE) {
      throw new Error(`File "${filePath}" exceeds maximum size of 1MB`)
    }

    if (content.includes("\0")) {
      throw new Error(`File "${filePath}" contains binary content and cannot be written`)
    }

    const fileDir = path.dirname(fullPath)
    await mkdir(fileDir, { recursive: true })

    await writeFile(fullPath, content, "utf-8")

    const existingSize = content.length
    const action = "created"

    return JSON.stringify({
      path: filePath,
      size: existingSize,
      action,
    })
  },
}

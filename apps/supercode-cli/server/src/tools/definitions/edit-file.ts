import { z } from "zod"
import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"

const editFileSchema = z.object({
  path: z.string().describe("Relative path from workspace root (e.g. 'src/App.tsx')"),
  oldText: z.string().describe("Exact substring to find in the existing file. Must match exactly, including whitespace and indentation."),
  newText: z.string().describe("Replacement text. Use real newline characters in the JSON payload, NOT the two-character sequence `\\n`."),
  description: z
    .string()
    .optional()
    .describe("Brief description of what this edit does (for display)"),
})

export type EditFileArgs = z.infer<typeof editFileSchema>

export const editFileTool = {
  description:
    "Make a targeted edit to an existing file by replacing a specific substring with new text. Use this when you want to add a function, change a few lines, or fix a small section WITHOUT rewriting the whole file.\n\n" +
    "WORKFLOW:\n" +
    "  1. read_file the target first so you have the exact current text.\n" +
    "  2. Pass the EXACT `oldText` (including leading indentation and trailing newline). Copy-paste from the read output — do NOT retype.\n" +
    "  3. Pass `newText` with the replacement. Use real newline characters in the JSON payload, NOT literal `\\n`.\n\n" +
    "If `oldText` appears multiple times in the file, ALL occurrences are replaced. If it appears zero times, the call fails — re-read the file and try again.\n\n" +
    "For creating new files, use write_file. For wholesale rewrites, use write_file after read_file.",
  parameters: editFileSchema,
  execute: async ({ path: filePath, oldText, newText }: EditFileArgs) => {
    const workspaceRoot = process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()
    const fullPath = path.resolve(workspaceRoot, filePath)

    if (!fullPath.startsWith(workspaceRoot)) {
      throw new Error(`Path "${filePath}" is outside workspace root`)
    }

    if (newText.includes("\0")) {
      throw new Error(`File "${filePath}" contains binary content and cannot be written`)
    }

    let original: string
    try {
      original = await readFile(fullPath, "utf-8")
    } catch (err: any) {
      if (err?.code === "ENOENT") {
        throw new Error(`File "${filePath}" does not exist. Use write_file to create new files.`)
      }
      throw err
    }

    const occurrences = original.split(oldText).length - 1
    if (occurrences === 0) {
      throw new Error(
        `oldText not found in "${filePath}". Re-read the file (read_file) to get the current content, then retry. ` +
          `Make sure whitespace, indentation, and trailing newlines match exactly.`,
      )
    }

    const updated = original.split(oldText).join(newText)
    await writeFile(fullPath, updated, "utf-8")

    return JSON.stringify({
      path: filePath,
      replacements: occurrences,
      sizeBefore: original.length,
      sizeAfter: updated.length,
      action: "edited",
    })
  },
}
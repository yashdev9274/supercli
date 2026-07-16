import { z } from "zod"
import { readFile, writeFile } from "node:fs/promises"
import { resolvePath, assertNoBinary } from "../../lib/workspace"
import { serialize, ok, fail } from "../../cli/ai/tool-result"

const editFileSchema = z.object({
  path: z.string().describe("Relative path from workspace root (e.g. 'src/App.tsx')"),
  oldText: z.string().describe("Exact substring to find in the existing file. Must match exactly, including whitespace and indentation."),
  newText: z.string().describe("Replacement text. Use real newline characters in the JSON payload, NOT the two-character sequence `\\n`."),
  replaceAll: z
    .boolean()
    .optional()
    .default(false)
    .describe("Replace ALL occurrences of oldText (default: false — fails if more than one match)"),
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
    "If `oldText` appears multiple times and `replaceAll` is false, the call fails. Set `replaceAll: true` to replace all occurrences. " +
    "If `oldText` appears zero times, the call fails — re-read the file and try again.\n\n" +
    "For creating new files, use write_file. For wholesale rewrites, use write_file after read_file.",
  parameters: editFileSchema,
  execute: async ({ path: filePath, oldText, newText, replaceAll }: EditFileArgs) =>
    serialize(async () => {
      const fullPath = resolvePath(filePath)
      assertNoBinary(newText, filePath)

      let original: string
      try {
        original = await readFile(fullPath, "utf-8")
      } catch (err: any) {
        if (err?.code === "ENOENT") {
          return fail(`File "${filePath}" does not exist. Use write_file to create new files.`)
        }
        throw err
      }

      const occurrences = original.split(oldText).length - 1

      if (occurrences === 0) {
        return fail(
          `oldText not found in "${filePath}". The file may have changed since you read it. Use read_file to get the exact current content, then copy-paste the exact text (including whitespace and indentation) as oldText.`,
          "Read the file again and verify the exact content before retrying",
        )
      }

      if (!replaceAll && occurrences > 1) {
        return fail(
          `oldText appears ${occurrences} times in "${filePath}". Use replaceAll: true to replace all, or refine oldText to match exactly one location.`,
          "Add more surrounding context to oldText to make it unique, or pass replaceAll: true",
        )
      }

      const updated = original.split(oldText).join(newText)
      await writeFile(fullPath, updated, "utf-8")

      return ok({
        path: filePath,
        replacements: occurrences,
        sizeBefore: original.length,
        sizeAfter: updated.length,
        action: "edited",
      })
    }),
}

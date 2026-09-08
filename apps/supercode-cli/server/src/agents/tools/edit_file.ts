import { z } from "zod"
import { updateText } from "../../runtime/workspace/file-operations"
import { serialize, ok } from "../../cli/ai/tool-result"
import { defineTool } from "../lib/define.ts"

const editFileSchema = z.object({
  path: z.string().min(1),
  oldText: z.string().min(1).describe("Exact existing text, including whitespace"),
  newText: z.string(),
  replaceAll: z.boolean().optional().default(false),
  expectedVersion: z.string().optional().describe("Version from read_file; rejects stale edits"),
  description: z.string().optional(),
})
export type EditFileArgs = z.infer<typeof editFileSchema>
export const editFileTool = defineTool({
  description: "Targeted exact replacement in an existing file. Read first; copy oldText exactly. Ambiguous or missing matches fail without writing. Re-read on failure rather than guessing. Use write_file for new files.",
  inputSchema: editFileSchema,
  execute: async (input) => serialize(async () => {
    const { path, oldText, newText, replaceAll, expectedVersion } = editFileSchema.parse(input)
    let replacements = 0
    const result = await updateText(path, (original) => {
      if (original === null) throw new Error("File does not exist. Use write_file to create it.")
      replacements = original.split(oldText).length - 1
      if (!replacements) throw new Error("oldText not found. Re-read the file before retrying.")
      if (!replaceAll && replacements > 1) throw new Error("Ambiguous oldText. Include more context or explicitly use replaceAll.")
      return original.split(oldText).join(newText)
    }, expectedVersion)
    return ok({ path, ...result, replacements, action: "edited" })
  }),
})
export default editFileTool

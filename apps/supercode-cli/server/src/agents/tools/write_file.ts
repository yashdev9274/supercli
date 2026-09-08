import { z } from "zod"
import { updateText } from "../../runtime/workspace/file-operations"
import { serialize, ok } from "../../cli/ai/tool-result"
import { defineTool } from "../lib/define.ts"

const writeFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
  expectedVersion: z.string().optional().describe("Version from read_file; rejects stale overwrites"),
  description: z.string().optional(),
})
export type WriteFileArgs = z.infer<typeof writeFileSchema>
export const writeFileTool = defineTool({
  description: "Create or replace a complete text file atomically. Read existing files first and provide expectedVersion. Prefer edit_file for targeted changes. Never omit existing content when overwriting.",
  inputSchema: writeFileSchema,
  execute: async (input) => serialize(async () => {
    const { path, content, expectedVersion } = writeFileSchema.parse(input)
    const result = await updateText(path, () => content, expectedVersion)
    return ok({ path, ...result, action: result.created ? "created" : "updated" })
  }),
})
export default writeFileTool

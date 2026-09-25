import { z } from "zod"
import { readText, contentVersion } from "../../runtime/workspace/file-operations"
import { serialize, ok } from "../../cli/ai/tool-result"
import { defineTool } from "../lib/define.ts"

const readFileSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().min(1).optional().default(1).describe("First line, 1-based"),
  maxLines: z.number().int().min(1).max(2000).optional().default(300),
  description: z.string().optional(),
})
export type ReadFileArgs = z.infer<typeof readFileSchema>
export const readFileTool = defineTool({
  description: "Read a workspace text file. Returns content, line range, truncation and version. Use startLine to continue reading; pass version as expectedVersion when editing.",
  inputSchema: readFileSchema,
  execute: async (input) => serialize(async () => {
    const { path, startLine, maxLines } = readFileSchema.parse(input)
    const { content } = await readText(path)
    const lines = content.split("\n")
    const selected: string[] = []
    let chars = 0
    for (const line of lines.slice(startLine - 1, startLine - 1 + maxLines)) {
      if (chars + line.length > 60000) {
        if (selected.length === 0) throw new Error("Line exceeds 60000 characters; use a targeted search or command to inspect it")
        break
      }
      selected.push(line)
      chars += line.length + 1
    }
    const endLine = startLine + selected.length - 1
    return ok({ path, content: selected.join("\n"), startLine, endLine,
      totalLines: lines.length, truncated: endLine < lines.length,
      nextLine: endLine < lines.length ? endLine + 1 : undefined,
      version: contentVersion(content),
    })
  }),
})
export default readFileTool

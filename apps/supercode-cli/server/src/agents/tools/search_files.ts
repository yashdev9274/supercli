import { z } from "zod"
import { discoverFiles, execFileAsync } from "../../runtime/workspace/discovery"
import { resolvePath } from "../../lib/workspace"
import { serialize, ok } from "../../cli/ai/tool-result"
import { defineTool } from "../lib/define.ts"

const searchFilesSchema = z.object({
  pattern: z.string().min(1).describe("Extended regular expression, or literal text when literal=true"),
  include: z.string().optional().describe("Filename glob, e.g. *.ts"),
  literal: z.boolean().optional().default(false),
  maxResults: z.number().int().min(1).max(200).optional().default(20),
})
export type SearchFilesArgs = z.infer<typeof searchFilesSchema>
export const searchFilesTool = defineTool({
  description: "Search workspace text with structured file/line/content results. Git ignores are respected in repositories. Errors are distinct from no matches. Narrow include when results are truncated.",
  inputSchema: searchFilesSchema,
  execute: async (input, ctx) => serialize(async () => {
    const { pattern, include, literal, maxResults } = searchFilesSchema.parse(input)
    const deadline = Date.now() + 20000
    const found = await discoverFiles(ctx?.signal)
    const matches: Array<{ file: string; line: number; content: string }> = []
    let scanned = 0
    let deadlineReached = false
    for (const file of found.files) {
      ctx?.signal?.throwIfAborted()
      if (Date.now() >= deadline) { deadlineReached = true; break }
      if (++scanned > 1000) break
      const args = ["-n", "-I", literal ? "-F" : "-E", "-m", String(maxResults + 1)]
      if (include) args.push(`--include=${include}`)
      args.push("--", pattern, resolvePath(file))
      try {
        const { stdout } = await execFileAsync("grep", args, {
          encoding: "utf8", maxBuffer: 2_000_000, timeout: 3000, signal: ctx?.signal,
        })
        for (const line of stdout.split("\n")) {
          const match = /^(\d+):(.*)$/.exec(line)
          if (match) matches.push({ file, line: Number(match[1]), content: match[2]!.slice(0, 2000) })
          if (matches.length > maxResults) break
        }
      } catch (error) {
        if ((error as { code?: number }).code !== 1) throw error
      }
      if (matches.length > maxResults) break
    }
    return ok({ pattern, matches: matches.slice(0, maxResults), total: Math.min(matches.length, maxResults),
      truncated: found.truncated || deadlineReached || scanned > 1000 || matches.length > maxResults,
      deadlineReached, scanned: Math.min(scanned, 1000) })
  }),
})
export default searchFilesTool

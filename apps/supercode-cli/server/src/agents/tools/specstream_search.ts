import { z } from "zod"
import { isSpecStreamEnabled, specstreamFetch } from "../../lib/specstream"
import { serialize, ok, fail } from "../../cli/ai/tool-result"
import { defineTool } from "../lib/define.ts"

const specstreamSearchSchema = z.object({
  query: z.string().min(1).describe("Search query"),
  maxResults: z.number().int().min(1).max(10).optional().default(5).describe("Maximum number of search results to return (1-10)"),
})

export type SpecStreamSearchArgs = z.infer<typeof specstreamSearchSchema>

const _def = {
  description:
    "Search the web using SpecStream. Returns titles, snippets, and URLs. " +
    "Only available when SPECSTREAM_API_KEY is set. " +
    "Returns { success: true, data: { query, results: [...], provider: \"specstream\" } } " +
    "or { success: false, error }. If success is false, do NOT invent search results.",
  inputSchema: specstreamSearchSchema,
  execute: async ({ query, maxResults }: SpecStreamSearchArgs) =>
    serialize(async () => {
      if (!isSpecStreamEnabled()) {
        return fail("SpecStream is not enabled", "Set SPECSTREAM_API_KEY.")
      }
      const resp = await specstreamFetch({ query, maxResults })
      if (!resp.ok) {
        return fail(resp.error || "SpecStream search failed", resp.hint)
      }
      const results = (resp.data?.results ?? []).slice(0, maxResults).map((item) => ({
        title: String(item.title ?? ""),
        snippet: String(item.snippet ?? ""),
        url: String(item.url ?? ""),
      }))
      return ok({ query, provider: "specstream", results })
    }),
}

export const specstreamSearchTool = defineTool(_def)
export default specstreamSearchTool

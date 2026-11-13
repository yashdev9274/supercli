import { z } from "zod"
import { isKeenableEnabled, keenableFetch } from "../../lib/keenable"
import { serialize, ok, fail } from "../../cli/ai/tool-result"
import { defineTool } from "../lib/define.ts"

const keenableSearchSchema = z.object({
  query: z.string().min(1).describe("Search query"),
  maxResults: z.number().int().min(1).max(10).optional().default(5).describe("Maximum number of search results to return (1-10)"),
})

export type KeenableSearchArgs = z.infer<typeof keenableSearchSchema>

const _def = {
  description:
    "Search the web using Keenable. Returns titles, snippets, and URLs. " +
    "Only available when KEENABLE_SEARCH=true or KEENABLE_API_KEY is set. " +
    "Returns { success: true, data: { query, results: [...], provider: \"keenable\" } } " +
    "or { success: false, error }. If success is false, do NOT invent search results.",
  inputSchema: keenableSearchSchema,
  execute: async ({ query, maxResults }: KeenableSearchArgs) =>
    serialize(async () => {
      if (!isKeenableEnabled()) {
        return fail(
          "Keenable is not enabled",
          "Set KEENABLE_SEARCH=true for the keyless endpoint, or set KEENABLE_API_KEY.",
        )
      }
      const resp = await keenableFetch({ query, maxResults })
      if (!resp.ok) {
        return fail(resp.error || "Keenable search failed", resp.hint)
      }
      const results = (resp.data?.results ?? []).slice(0, maxResults).map((item) => ({
        title: String(item.title ?? ""),
        snippet: String(item.snippet ?? ""),
        url: String(item.url ?? ""),
      }))
      return ok({ query, provider: "keenable", results })
    }),
}

export const keenableSearchTool = defineTool(_def)
export default keenableSearchTool

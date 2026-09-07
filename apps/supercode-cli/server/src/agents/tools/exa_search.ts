import { z } from "zod"
import { exaFetch } from "../../lib/exa"
import { serialize, ok, fail } from "../../cli/ai/tool-result"
import { defineTool } from "../lib/define.ts"

const exaSearchSchema = z.object({
  query: z.string().describe("Search query"),
  maxResults: z.number().optional().default(10).describe("Maximum number of search results to return (1-50)"),
})

export type ExaSearchArgs = z.infer<typeof exaSearchSchema>

const _def = {
  description:
    "Search the web using Exa. Returns relevant results with titles, snippets, and URLs. " +
    "Best for finding current information, news, documentation, and any topic the user asks about. " +
    "Returns a structured result: { success: true, data: { query, results: [...] } } with title/snippet/url, " +
    "or { success: false, error } when search is unavailable. " +
    "If success is false, do NOT invent search results — relay the error to the user.",
  inputSchema: exaSearchSchema,
  execute: async ({ query, maxResults }: ExaSearchArgs) =>
    serialize(async () => {
      const resp = await exaFetch({
        apiPath: "/search",
        proxyAction: "exa-search",
        body: { query, numResults: maxResults },
        timeout: 30000,
      })

      if (!resp.ok) {
        return fail(resp.error ?? "Exa search failed", resp.hint)
      }

      const rawResults = Array.isArray(resp.data?.results) ? resp.data.results : []

      const results = rawResults.slice(0, maxResults).map((item: any) => ({
        title: String(item.title ?? ""),
        snippet: String(item.snippet ?? item.text ?? ""),
        url: String(item.url ?? ""),
        publishedDate: item.publishedDate ?? null,
      }))

      return ok({ query, results })
    }),
}

export const exaSearchTool = defineTool(_def)
export default exaSearchTool

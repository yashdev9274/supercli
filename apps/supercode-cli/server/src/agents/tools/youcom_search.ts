import { z } from "zod"
import { youcomFetch } from "../../lib/youcom"
import { serialize, ok, fail } from "../../cli/ai/tool-result"
import { defineTool } from "../lib/define.ts"

const youcomSearchSchema = z.object({
  query: z.string().min(1).describe("Search query"),
  maxResults: z.number().int().min(1).max(20).optional().default(5).describe("Maximum number of search results to return (1-20)"),
})

export type YoucomSearchArgs = z.infer<typeof youcomSearchSchema>

function mapYoucomResults(data: any, maxResults: number) {
  const results = data?.results
  const webResults = Array.isArray(results?.web) ? results.web : []
  const newsResults = Array.isArray(results?.news) ? results.news : []
  const flat = [...webResults, ...newsResults]
  return flat.slice(0, maxResults).map((item: any) => ({
    title: String(item.title ?? ""),
    snippet: String(item.description ?? item.snippet ?? ""),
    link: String(item.url ?? ""),
    publishedDate: item.published_date ?? item.publishedDate ?? null,
  }))
}

const _def = {
  description:
    "Search the web using the You.com Search API. " +
    "Returns relevant results with titles, snippets, and URLs. " +
    "Best for finding current information, news, documentation, and any topic the user asks about. " +
    "Returns a structured result: { success: true, data: { query, results: [...], provider } } with title/snippet/link, " +
    "or { success: false, error } when search is unavailable. " +
    "If success is false, do NOT invent search results — relay the error to the user.",
  inputSchema: youcomSearchSchema,
  execute: async (input: YoucomSearchArgs, ctx?: { signal?: AbortSignal }) => {
    const { query, maxResults } = youcomSearchSchema.parse(input)
    return serialize(async () => {
      const resp = await youcomFetch({
        apiPath: "/v1/search",
        body: { query, count: maxResults },
        timeout: 30000,
        signal: ctx?.signal,
      })

      if (resp.ok) {
        return ok({
          query,
          provider: "youcom",
          results: mapYoucomResults(resp.data, maxResults),
        })
      }

      return fail(
        `Web search failed via You.com: ${resp.error}`,
        resp.hint ?? "Set a valid YDC_API_KEY, or use exa_search / firecrawl_search instead.",
      )
    })
  },
}

export const youcomSearchTool = defineTool(_def)
export default youcomSearchTool

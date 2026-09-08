import { z } from "zod"
import { exaFetch } from "../../lib/exa"
import { firecrawlFetch } from "../../lib/firecrawl"
import { serialize, ok, fail } from "../../cli/ai/tool-result"
import { defineTool } from "../lib/define.ts"

const exaSearchSchema = z.object({
  query: z.string().min(1).describe("Search query"),
  maxResults: z.number().int().min(1).max(50).optional().default(10).describe("Maximum number of search results to return (1-50)"),
})

export type ExaSearchArgs = z.infer<typeof exaSearchSchema>

function mapExaResults(rawResults: any[], maxResults: number) {
  return rawResults.slice(0, maxResults).map((item: any) => ({
    title: String(item.title ?? ""),
    snippet: String(item.snippet ?? item.text ?? ""),
    url: String(item.url ?? ""),
    publishedDate: item.publishedDate ?? null,
  }))
}

function mapFirecrawlResults(data: any, maxResults: number) {
  const webResults = Array.isArray(data?.data?.web) ? data.data.web : []
  const newsResults = Array.isArray(data?.data?.news) ? data.data.news : []
  const flat = Array.isArray(data?.data) ? data.data : []
  const allResults = [...webResults, ...newsResults, ...flat].slice(0, maxResults)
  return allResults.map((item: any) => ({
    title: String(item.title ?? ""),
    snippet: String(item.description ?? item.snippet ?? item.text ?? ""),
    url: String(item.url ?? item.link ?? ""),
    publishedDate: item.publishedDate ?? null,
  }))
}

const _def = {
  description:
    "Search the web using Exa (preferred) with automatic Firecrawl fallback. " +
    "Returns relevant results with titles, snippets, and URLs. " +
    "Best for finding current information, news, documentation, and any topic the user asks about. " +
    "Returns a structured result: { success: true, data: { query, results: [...], provider } } with title/snippet/url, " +
    "or { success: false, error } when search is unavailable. " +
    "If success is false, do NOT invent search results — relay the error to the user.",
  inputSchema: exaSearchSchema,
  execute: async ({ query, maxResults }: ExaSearchArgs) =>
    serialize(async () => {
      const exaResp = await exaFetch({
        apiPath: "/search",
        proxyAction: "exa-search",
        body: { query, numResults: maxResults },
        timeout: 30000,
      })

      if (exaResp.ok) {
        const rawResults = Array.isArray(exaResp.data?.results) ? exaResp.data.results : []
        return ok({
          query,
          provider: "exa",
          results: mapExaResults(rawResults, maxResults),
        })
      }

      // Cross-provider fallback: Exa failed → try Firecrawl search.
      const fcResp = await firecrawlFetch({
        apiPath: "/search",
        proxyAction: "firecrawl-search",
        body: {
          query,
          limit: maxResults,
          sources: [{ type: "web" }],
        },
        timeout: 30000,
      })

      if (fcResp.ok) {
        return ok({
          query,
          provider: "firecrawl",
          results: mapFirecrawlResults(fcResp.data, maxResults),
          note: `Exa failed (${exaResp.error}); used Firecrawl fallback.`,
        })
      }

      return fail(
        `Web search failed via Exa and Firecrawl. Exa: ${exaResp.error}. Firecrawl: ${fcResp.error}`,
        exaResp.hint ?? fcResp.hint ?? "Set valid EXA_API_KEY and/or FIRECRAWL_API_KEY, or use url_fetch with a known URL.",
      )
    }),
}

export const exaSearchTool = defineTool(_def)
export default exaSearchTool

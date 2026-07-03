import { z } from "zod"
import { firecrawlFetch } from "../../lib/firecrawl"
import { serialize, ok, fail } from "../../cli/ai/tool-result"

const firecrawlSearchSchema = z.object({
  query: z.string().describe("Search query"),
  maxResults: z.number().optional().default(10).describe("Maximum number of search results to return (1-100)"),
  includeDomains: z
    .array(z.string())
    .optional()
    .describe("Only return results from these domains (hostnames only, no protocol)"),
  excludeDomains: z
    .array(z.string())
    .optional()
    .describe("Exclude results from these domains (hostnames only, no protocol)"),
})

export type FirecrawlSearchArgs = z.infer<typeof firecrawlSearchSchema>

export const firecrawlSearchTool = {
  description:
    "[REQUIRED] Search the web for any company, product, service, topic, or current information. " +
    "You MUST call this tool whenever the user asks about something you don't know or that may have changed. " +
    "Do NOT answer from your training data — always search first. " +
    "Supports domain filtering via includeDomains/excludeDomains. " +
    "Returns a structured result: { success: true, data: { query, results: [...] } } with title/snippet/link, " +
    "or { success: false, error } when search is unavailable or finds nothing. " +
    "If success is false, do NOT invent search results — relay the error to the user.",
  parameters: firecrawlSearchSchema,
  execute: async ({ query, maxResults, includeDomains, excludeDomains }: FirecrawlSearchArgs) =>
    serialize(async () => {
      const endpoint = "/search"
      const body: Record<string, unknown> = {
        query,
        limit: maxResults,
        sources: [{ type: "web" }],
      }
      if (includeDomains) body.includeDomains = includeDomains
      if (excludeDomains) body.excludeDomains = excludeDomains

      const resp = await firecrawlFetch({ apiPath: "/search", proxyAction: "firecrawl-search", body, timeout: 30000 })

      if (!resp.ok) {
        return fail(resp.error ?? "Firecrawl search failed", resp.hint)
      }

      const webResults = Array.isArray(resp.data?.data?.web) ? resp.data.data.web : []
      const newsResults = Array.isArray(resp.data?.data?.news) ? resp.data.data.news : []
      const allResults = [...webResults, ...newsResults].slice(0, maxResults)

      const results = allResults.map((item: any) => ({
        title: String(item.title ?? ""),
        snippet: String(item.description ?? item.snippet ?? ""),
        link: String(item.url ?? item.link ?? ""),
      }))

      return ok({ query, results })
    }),
}

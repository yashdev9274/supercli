import { z } from "zod"
import { loadEnvOnce } from "../../lib/load-env"
import { proxyToolCall } from "../../lib/proxy-tools"

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2"

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

export type FirecrawlSearchResult =
  | { success: true; query: string; results: Array<{ title: string; snippet: string; link: string }> }
  | { success: false; error: string; hint?: string; configured: boolean }

function formatResults(items: any[]): Array<{ title: string; snippet: string; link: string }> {
  return items.map((item: any) => ({
    title: String(item.title ?? ""),
    snippet: String(item.description ?? item.snippet ?? ""),
    link: String(item.url ?? item.link ?? ""),
  }))
}

export const firecrawlSearchTool = {
  description:
    "[REQUIRED] Search the web for any company, product, service, topic, or current information. " +
    "You MUST call this tool whenever the user asks about something you don't know or that may have changed. " +
    "Do NOT answer from your training data — always search first. " +
    "Supports domain filtering via includeDomains/excludeDomains. " +
    "Returns a structured result: { success: true, results: [...] } with title/snippet/link, " +
    "or { success: false, error } when search is unavailable or finds nothing. " +
    "If success is false, do NOT invent search results — relay the error to the user.",
  parameters: firecrawlSearchSchema,
  execute: async ({ query, maxResults, includeDomains, excludeDomains }: FirecrawlSearchArgs): Promise<string> => {
    loadEnvOnce()
    const apiKey = process.env.FIRECRAWL_API_KEY

    if (!apiKey) {
      const proxy = await proxyToolCall("/api/tools/firecrawl-search", {
        query,
        limit: maxResults,
        sources: [{ type: "web" }],
        ...(includeDomains ? { includeDomains } : {}),
        ...(excludeDomains ? { excludeDomains } : {}),
      })

      if (proxy.ok) {
        const webResults = Array.isArray(proxy.data?.data?.web) ? proxy.data.data.web : []
        const newsResults = Array.isArray(proxy.data?.data?.news) ? proxy.data.data.news : []
        const results = formatResults([...webResults, ...newsResults].slice(0, maxResults))
        return JSON.stringify({ success: true, query, results } satisfies FirecrawlSearchResult)
      }

      return JSON.stringify({
        success: false,
        error: "Firecrawl search is not configured. Set FIRECRAWL_API_KEY environment variable.",
        hint:
          "Tell the user firecrawl_search is unavailable and suggest alternatives: " +
          "(1) ask the user to provide a specific URL and call firecrawl_scrape on it, " +
          "(2) use the existing web_search tool with Google CSE, " +
          "(3) set FIRECRAWL_API_KEY in the .env or on the server (Render).",
        configured: false,
      } satisfies FirecrawlSearchResult)
    }

    try {
      const body: Record<string, unknown> = {
        query,
        limit: maxResults,
        sources: [{ type: "web" }],
      }

      if (includeDomains) body.includeDomains = includeDomains
      if (excludeDomains) body.excludeDomains = excludeDomains

      const response = await fetch(`${FIRECRAWL_BASE}/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        const result: FirecrawlSearchResult = {
          success: false,
          error: `Firecrawl search returned HTTP ${response.status}`,
          hint:
            response.status === 429
              ? "Rate limited. Try again later or use fewer queries."
              : response.status === 402
                ? "Firecrawl account requires payment. Check your credit balance."
                : response.status === 401 || response.status === 403
                  ? "Invalid FIRECRAWL_API_KEY. Check your API key."
                  : undefined,
          configured: true,
        }
        return JSON.stringify(result)
      }

      const data = await response.json() as any
      const webResults = Array.isArray(data?.data?.web) ? data.data.web : []
      const newsResults = Array.isArray(data?.data?.news) ? data.data.news : []
      const allResults = [...webResults, ...newsResults]

      const results = allResults.slice(0, maxResults).map((item: any) => ({
        title: String(item.title ?? ""),
        snippet: String(item.description ?? item.snippet ?? ""),
        link: String(item.url ?? item.link ?? ""),
      }))

      const ok: FirecrawlSearchResult = { success: true, query, results }
      return JSON.stringify(ok)
    } catch (error) {
      const result: FirecrawlSearchResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        configured: true,
      }
      return JSON.stringify(result)
    }
  },
}

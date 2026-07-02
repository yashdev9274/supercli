import { z } from "zod"
import { loadEnvOnce } from "../../lib/load-env"

const webSearchSchema = z.object({
  query: z.string().describe("Search query"),
  maxResults: z.number().optional().default(5).describe("Maximum number of search results to return"),
})

export type WebSearchArgs = z.infer<typeof webSearchSchema>

export type WebSearchResult =
  | { success: true; query: string; results: Array<{ title: string; snippet: string; link: string }> }
  | { success: false; error: string; hint?: string; configured: boolean }

export const webSearchTool = {
  description:
    "[LEGACY] Search the web using Google Custom Search. Consider using firecrawl_search instead — " +
    "it supports domain filtering, richer results, and is the preferred web search tool. " +
    "Only use this as a fallback when firecrawl_search fails. " +
    "Returns a structured result: { success: true, results: [...] } with title/snippet/link, " +
    "or { success: false, error } when search is unavailable or finds nothing. " +
    "If success is false, do NOT invent search results — relay the error to the user.",
  parameters: webSearchSchema,
  execute: async ({ query, maxResults }: WebSearchArgs): Promise<string> => {
    loadEnvOnce()

    const apiKey = process.env.GOOGLE_API_KEY
    const cx = process.env.GOOGLE_CSE_ID

    if (!apiKey || !cx) {
      const result: WebSearchResult = {
        success: false,
        error:
          "Web search is not configured. Set GOOGLE_API_KEY and GOOGLE_CSE_ID environment variables.",
        hint:
          "Tell the user web_search is unavailable and suggest alternatives: " +
          "(1) ask the user to provide a specific URL and call url_fetch on it, " +
          "(2) call url_fetch on a known URL (e.g. api.github.com/repos/{owner}/{name} for GitHub, " +
          "raw.githubusercontent.com/{owner}/{name}/main/README.md for raw files), " +
          "(3) ask the user to enable web_search by setting the env vars in apps/supercode-cli/server/.env.",
        configured: false,
      }
      return JSON.stringify(result)
    }

    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`
      const response = await fetch(url)
      if (!response.ok) {
        const body = await response.text().catch(() => "")
        const result: WebSearchResult = {
          success: false,
          error: `Google Custom Search API returned HTTP ${response.status}`,
          hint:
            response.status === 429
              ? "Search quota exceeded. Try again later or use url_fetch."
              : response.status === 403
                ? "API key invalid or restricted. Check GOOGLE_API_KEY permissions in Google Cloud Console."
                : undefined,
          configured: true,
        }
        return JSON.stringify(result)
      }

      const data = (await response.json()) as any
      const items = Array.isArray(data?.items) ? data.items : []

      if (items.length === 0) {
        const result: WebSearchResult = {
          success: true,
          query,
          results: [],
        }
        return JSON.stringify(result)
      }

      const results = items.slice(0, maxResults).map((item: any) => ({
        title: String(item.title ?? ""),
        snippet: String(item.snippet ?? ""),
        link: String(item.link ?? ""),
      }))

      const ok: WebSearchResult = { success: true, query, results }
      return JSON.stringify(ok)
    } catch (error) {
      const result: WebSearchResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        configured: true,
      }
      return JSON.stringify(result)
    }
  },
}
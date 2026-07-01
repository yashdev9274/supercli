import { z } from "zod"

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2"

const firecrawlMapSchema = z.object({
  url: z.string().describe("The base URL to discover links from"),
  search: z.string().optional().describe("Search term to filter URLs by relevance (e.g. 'blog', 'docs')"),
  limit: z.number().optional().default(200).describe("Maximum number of links to return (1-100000)"),
  includeSubdomains: z.boolean().optional().default(true).describe("Include subdomains of the website"),
})

export type FirecrawlMapArgs = z.infer<typeof firecrawlMapSchema>

export type FirecrawlMapResult =
  | { success: true; url: string; links: string[]; total: number }
  | { success: false; error: string; hint?: string; configured: boolean }

export const firecrawlMapTool = {
  description:
    "Discover URLs from a website using Firecrawl Map. " +
    "Use this to find all available pages, documentation sections, or blog posts on a site. " +
    "Returns a structured result: { success: true, links: [...] } with discovered URLs. " +
    "Combine with firecrawl_scrape to read specific pages. " +
    "If success is false, do NOT invent results — relay the error to the user.",
  parameters: firecrawlMapSchema,
  execute: async ({ url, search, limit, includeSubdomains }: FirecrawlMapArgs): Promise<string> => {
    const apiKey = process.env.FIRECRAWL_API_KEY

    if (!apiKey) {
      const result: FirecrawlMapResult = {
        success: false,
        error: "Firecrawl map is not configured. Set FIRECRAWL_API_KEY environment variable.",
        hint:
          "Tell the user firecrawl_map is unavailable and suggest alternatives: " +
          "(1) use firecrawl_search with site:domain.com, " +
          "(2) use the existing url_fetch tool, " +
          "(3) set FIRECRAWL_API_KEY in the .env file.",
        configured: false,
      }
      return JSON.stringify(result)
    }

    let urlObj: URL
    try {
      urlObj = new URL(url)
    } catch {
      const result: FirecrawlMapResult = {
        success: false,
        error: `Invalid URL: "${url}"`,
        hint: "URLs must include the scheme, e.g. https://example.com",
        configured: true,
      }
      return JSON.stringify(result)
    }

    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      const result: FirecrawlMapResult = {
        success: false,
        error: `Unsupported URL scheme: ${urlObj.protocol}`,
        hint: "Only http:// and https:// URLs are allowed",
        configured: true,
      }
      return JSON.stringify(result)
    }

    try {
      const response = await fetch(`${FIRECRAWL_BASE}/map`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          search,
          limit,
          includeSubdomains,
          ignoreQueryParameters: true,
        }),
        signal: AbortSignal.timeout(60000),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => "")
        const result: FirecrawlMapResult = {
          success: false,
          error: `Firecrawl map returned HTTP ${response.status}`,
          hint:
            response.status === 429
              ? "Rate limited. Try again later."
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
      const links = Array.isArray(data?.links) ? data.links : []

      const result: FirecrawlMapResult = {
        success: true,
        url,
        links,
        total: links.length,
      }
      return JSON.stringify(result)
    } catch (error) {
      const result: FirecrawlMapResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        configured: true,
      }
      return JSON.stringify(result)
    }
  },
}

import { z } from "zod"

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v2"

const firecrawlScrapeSchema = z.object({
  url: z.string().describe("URL to fetch content from"),
  maxChars: z.number().optional().default(8000).describe("Maximum characters to extract"),
})

export type FirecrawlScrapeArgs = z.infer<typeof firecrawlScrapeSchema>

export type FirecrawlScrapeResult =
  | { success: true; content: string; bytesRead: number; status: number; contentType: string }
  | { success: false; error: string; status?: number; contentType?: string; hint?: string }

export const firecrawlScrapeTool = {
  description:
    "Fetch and extract text content from a URL using Firecrawl. " +
    "Use this to read documentation, articles, or any web page the user references. " +
    "Handles JavaScript-rendered pages (SPAs) that plain fetch() cannot. " +
    "Returns a structured result: { success: true, content } on success, or { success: false, error, hint } on failure. " +
    "If success is false, do NOT invent content — relay the error to the user and try a different approach.",
  parameters: firecrawlScrapeSchema,
  execute: async ({ url, maxChars }: FirecrawlScrapeArgs): Promise<string> => {
    const apiKey = process.env.FIRECRAWL_API_KEY

    if (!apiKey) {
      const result: FirecrawlScrapeResult = {
        success: false,
        error: "Firecrawl scrape is not configured. Set FIRECRAWL_API_KEY environment variable.",
        hint:
          "Tell the user firecrawl_scrape is unavailable and suggest alternatives: " +
          "(1) use the existing url_fetch tool, " +
          "(2) set FIRECRAWL_API_KEY in the .env file.",
      }
      return JSON.stringify(result)
    }

    let urlObj: URL
    try {
      urlObj = new URL(url)
    } catch {
      const result: FirecrawlScrapeResult = {
        success: false,
        error: `Invalid URL: "${url}"`,
        hint: "URLs must include the scheme, e.g. https://example.com/path",
      }
      return JSON.stringify(result)
    }

    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      const result: FirecrawlScrapeResult = {
        success: false,
        error: `Unsupported URL scheme: ${urlObj.protocol}`,
        hint: "Only http:// and https:// URLs are allowed",
      }
      return JSON.stringify(result)
    }

    try {
      const response = await fetch(`${FIRECRAWL_BASE}/scrape`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
        signal: AbortSignal.timeout(30000),
      })

      const body = await response.json() as any

      if (!response.ok) {
        const result: FirecrawlScrapeResult = {
          success: false,
          error: `Firecrawl scrape returned HTTP ${response.status}`,
          status: response.status,
          hint:
            response.status === 429
              ? "Rate limited. Try again later."
              : response.status === 402
                ? "Firecrawl account requires payment. Check your credit balance."
                : response.status === 401 || response.status === 403
                  ? "Invalid FIRECRAWL_API_KEY. Check your API key."
                  : undefined,
        }
        return JSON.stringify(result)
      }

      if (!body?.success || !body?.data) {
        const result: FirecrawlScrapeResult = {
          success: false,
          error: "Firecrawl returned an empty response",
          status: response.status,
          hint: "The page may be unreachable or blocked.",
        }
        return JSON.stringify(result)
      }

      const markdown = body.data.markdown ?? ""
      const cleaned = markdown.trim()

      if (!cleaned) {
        const result: FirecrawlScrapeResult = {
          success: false,
          error: "Fetched URL returned no extractable text content",
          status: 200,
          contentType: body.data.metadata?.contentType ?? "text/html",
          hint: "The page may be JavaScript-rendered or require authentication.",
        }
        return JSON.stringify(result)
      }

      const result: FirecrawlScrapeResult = {
        success: true,
        content: cleaned.slice(0, maxChars),
        bytesRead: cleaned.length,
        status: 200,
        contentType: body.data.metadata?.contentType ?? "text/markdown",
      }
      return JSON.stringify(result)
    } catch (error: any) {
      const isTimeout = error?.name === "TimeoutError" || error?.name === "AbortError"
      const result: FirecrawlScrapeResult = {
        success: false,
        error: isTimeout
          ? "Request timed out after 30 seconds"
          : error instanceof Error
            ? error.message
            : String(error),
        hint: isTimeout
          ? "The site is slow or unreachable. Try firecrawl_search or url_fetch instead."
          : undefined,
      }
      return JSON.stringify(result)
    }
  },
}

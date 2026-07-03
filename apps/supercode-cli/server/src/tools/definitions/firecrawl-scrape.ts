import { z } from "zod"
import { firecrawlFetch } from "../../lib/firecrawl"
import { serialize, ok, fail } from "../../cli/ai/tool-result"

const firecrawlScrapeSchema = z.object({
  url: z.string().describe("URL to fetch content from"),
  maxChars: z.number().optional().default(8000).describe("Maximum characters to extract"),
})

export type FirecrawlScrapeArgs = z.infer<typeof firecrawlScrapeSchema>

export const firecrawlScrapeTool = {
  description:
    "Fetch and extract text content from a URL using Firecrawl. " +
    "Use this to read documentation, articles, or any web page the user references. " +
    "Handles JavaScript-rendered pages (SPAs) that plain fetch() cannot. " +
    "Returns a structured result: { success: true, data: { content } } on success, or { success: false, error, hint } on failure. " +
    "If success is false, do NOT invent content — relay the error to the user and try a different approach.",
  parameters: firecrawlScrapeSchema,
  execute: async ({ url, maxChars }: FirecrawlScrapeArgs) =>
    serialize(async () => {
      let urlObj: URL
      try {
        urlObj = new URL(url)
      } catch {
        return fail(`Invalid URL: "${url}"`, "URLs must include the scheme, e.g. https://example.com/path")
      }

      if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
        return fail(`Unsupported URL scheme: ${urlObj.protocol}`, "Only http:// and https:// URLs are allowed")
      }

      const resp = await firecrawlFetch({
        apiPath: "/scrape",
        proxyAction: "firecrawl-scrape",
        body: { url, formats: ["markdown"], onlyMainContent: true },
        timeout: 30000,
      })

      if (!resp.ok) {
        return fail(resp.error ?? "Firecrawl scrape failed", resp.hint)
      }

      if (!resp.data?.success || !resp.data?.data) {
        return fail("Firecrawl returned an empty response", "The page may be unreachable or blocked.")
      }

      const markdown = resp.data.data.markdown ?? ""
      const cleaned = markdown.trim()

      if (!cleaned) {
        return fail("Fetched URL returned no extractable text content", "The page may be JavaScript-rendered or require authentication.")
      }

      return ok({
        content: cleaned.slice(0, maxChars),
        bytesRead: cleaned.length,
        status: 200,
        contentType: resp.data.data.metadata?.contentType ?? "text/markdown",
      })
    }),
}

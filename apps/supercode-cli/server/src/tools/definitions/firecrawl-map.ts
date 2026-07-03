import { z } from "zod"
import { firecrawlFetch } from "../../lib/firecrawl"
import { serialize, ok, fail } from "../../cli/ai/tool-result"

const firecrawlMapSchema = z.object({
  url: z.string().describe("The base URL to discover links from"),
  search: z.string().optional().describe("Search term to filter URLs by relevance (e.g. 'blog', 'docs')"),
  limit: z.number().optional().default(200).describe("Maximum number of links to return (1-100000)"),
  includeSubdomains: z.boolean().optional().default(true).describe("Include subdomains of the website"),
})

export type FirecrawlMapArgs = z.infer<typeof firecrawlMapSchema>

export const firecrawlMapTool = {
  description:
    "Discover URLs from a website using Firecrawl Map. " +
    "Use this to find all available pages, documentation sections, or blog posts on a site. " +
    "Returns a structured result: { success: true, data: { links: [...] } } with discovered URLs. " +
    "Combine with firecrawl_scrape to read specific pages. " +
    "If success is false, do NOT invent results — relay the error to the user.",
  parameters: firecrawlMapSchema,
  execute: async ({ url, search, limit, includeSubdomains }: FirecrawlMapArgs) =>
    serialize(async () => {
      let urlObj: URL
      try {
        urlObj = new URL(url)
      } catch {
        return fail(`Invalid URL: "${url}"`, "URLs must include the scheme, e.g. https://example.com")
      }

      if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
        return fail(`Unsupported URL scheme: ${urlObj.protocol}`, "Only http:// and https:// URLs are allowed")
      }

      const resp = await firecrawlFetch({
        apiPath: "/map",
        proxyAction: "firecrawl-map",
        body: { url, search, limit, includeSubdomains, ignoreQueryParameters: true },
        timeout: 60000,
      })

      if (!resp.ok) {
        return fail(resp.error ?? "Firecrawl map failed", resp.hint)
      }

      const links = Array.isArray(resp.data?.links) ? resp.data.links : []

      return ok({ url, links, total: links.length })
    }),
}

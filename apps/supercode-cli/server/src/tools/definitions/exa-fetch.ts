import { z } from "zod"
import { exaFetch } from "../../lib/exa"
import { serialize, ok, fail } from "../../cli/ai/tool-result"

const exaFetchSchema = z.object({
  url: z.string().describe("URL to fetch content from"),
  maxChars: z.number().optional().default(8000).describe("Maximum characters to extract"),
})

export type ExaFetchArgs = z.infer<typeof exaFetchSchema>

export const exaFetchTool = {
  description:
    "Fetch and extract text content from a URL using Exa. " +
    "Use this to read documentation, articles, or any web page the user references. " +
    "Handles JavaScript-rendered pages that plain fetch() cannot. " +
    "Returns a structured result: { success: true, data: { content, url } } on success, " +
    "or { success: false, error, hint } on failure. " +
    "If success is false, do NOT invent content — relay the error to the user.",
  parameters: exaFetchSchema,
  execute: async ({ url, maxChars }: ExaFetchArgs) =>
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

      const resp = await exaFetch({
        apiPath: "/contents",
        proxyAction: "exa-fetch",
        body: {
          ids: [url],
          text: true,
          truncate: maxChars,
        },
        timeout: 30000,
      })

      if (!resp.ok) {
        return fail(resp.error ?? "Exa fetch failed", resp.hint)
      }

      const results = Array.isArray(resp.data?.results) ? resp.data.results : []
      const page = results.find((r: any) => r.url === url || r.id === url)

      if (!page) {
        return fail("Exa returned no content for the given URL", "The page may be inaccessible or blocked.")
      }

      const content = String(page.text ?? "").trim()

      if (!content) {
        return fail("Fetched URL returned no extractable text content", "The page may be JavaScript-rendered or require authentication.")
      }

      return ok({
        content: content.slice(0, maxChars),
        url: page.url ?? url,
      })
    }),
}

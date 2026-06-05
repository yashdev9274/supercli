import { z } from "zod"

const urlFetchSchema = z.object({
  url: z.string().describe("URL to fetch content from"),
  maxChars: z.number().optional().default(8000).describe("Maximum characters to extract"),
})

export type UrlFetchArgs = z.infer<typeof urlFetchSchema>

export const urlFetchTool = {
  description: "Fetch and extract text content from a URL. Use this to read documentation, articles, or any web page the user references.",
  parameters: urlFetchSchema,
  execute: async ({ url, maxChars }: UrlFetchArgs) => {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; SupercodeAI/1.0)",
        },
      })
      if (!response.ok) {
        return `Failed to fetch URL: ${response.status} ${response.statusText}`
      }
      const text = await response.text()
      const cleaned = text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
      return cleaned.slice(0, maxChars)
    } catch (error) {
      return `Error fetching URL: ${error instanceof Error ? error.message : String(error)}`
    }
  },
}

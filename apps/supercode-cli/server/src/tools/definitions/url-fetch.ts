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
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) {
        return `Failed to fetch URL: ${response.status} ${response.statusText}`
      }
      const reader = response.body?.getReader()
      if (!reader) {
        return "No response body"
      }
      const decoder = new TextDecoder()
      let accumulated = ""
      let done = false
      while (!done && accumulated.length < maxChars) {
        const { value, done: chunkDone } = await reader.read()
        done = chunkDone
        if (value) {
          accumulated += decoder.decode(value, { stream: !done })
        }
      }
      const fullText = accumulated
      const cleaned = fullText
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim()
      return cleaned.slice(0, maxChars)
    } catch (error: any) {
      if (error?.name === "TimeoutError") {
        return "Error fetching URL: request timed out after 15 seconds"
      }
      return `Error fetching URL: ${error instanceof Error ? error.message : String(error)}`
    }
  },
}

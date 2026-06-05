import { z } from "zod"

const webSearchSchema = z.object({
  query: z.string().describe("Search query"),
  maxResults: z.number().optional().default(5).describe("Maximum number of search results to return"),
})

export type WebSearchArgs = z.infer<typeof webSearchSchema>

export const webSearchTool = {
  description: "Search the web using Google Search. Use this to find current information, news, documentation, or any real-time data the user asks about.",
  parameters: webSearchSchema,
  execute: async ({ query, maxResults }: WebSearchArgs) => {
    const apiKey = process.env.GOOGLE_API_KEY
    const cx = process.env.GOOGLE_CSE_ID

    if (!apiKey || !cx) {
      return "Web search requires GOOGLE_API_KEY and GOOGLE_CSE_ID environment variables to be set. Please configure these to enable web search."
    }

    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}`
      const response = await fetch(url)
      if (!response.ok) {
        const body = await response.text()
        return `Search failed: ${response.status} - ${body.slice(0, 300)}`
      }
      const data = await response.json() as any
      if (!data.items || data.items.length === 0) {
        return "No search results found."
      }

      return data.items
        .slice(0, maxResults)
        .map((item: any, i: number) =>
          `${i + 1}. ${item.title}\n   ${item.snippet}\n   ${item.link}`
        )
        .join("\n\n")
    } catch (error) {
      return `Search error: ${error instanceof Error ? error.message : String(error)}`
    }
  },
}

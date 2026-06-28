import { z } from "zod"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

const webSearchSchema = z.object({
  query: z.string().describe("Search query"),
  maxResults: z.number().optional().default(5).describe("Maximum number of search results to return"),
})

export type WebSearchArgs = z.infer<typeof webSearchSchema>

export type WebSearchResult =
  | { success: true; query: string; results: Array<{ title: string; snippet: string; link: string }> }
  | { success: false; error: string; hint?: string; configured: boolean }

// Load .env files from a few likely locations into process.env, but only for
// the keys we actually need (avoids stomping on anything else).
//
// Many users configure GOOGLE_API_KEY / GOOGLE_CSE_ID in apps/supercode-cli/
// server/.env but process.env doesn't see them because Bun's auto-load only
// runs in entrypoints, not in lazily-loaded tool modules. This makes the tool
// behave as if it's "unconfigured" when it actually isn't.
function loadEnvOnce() {
  if ((loadEnvOnce as any).__done) return
  ;(loadEnvOnce as any).__done = true

  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "..", ".env"),
    resolve(process.cwd(), "..", "..", ".env"),
  ]
  // Walk up to find the server .env (works for both `bun src/index.ts` and
  // `bun src/cli/main.ts` invocations from inside server/).
  let dir = process.cwd()
  for (let i = 0; i < 5; i++) {
    candidates.push(resolve(dir, ".env"))
    dir = resolve(dir, "..")
  }

  const seen = new Set<string>()
  for (const path of candidates) {
    if (seen.has(path)) continue
    seen.add(path)
    if (!existsSync(path)) continue
    try {
      const raw = readFileSync(path, "utf8")
      for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue
        const eq = trimmed.indexOf("=")
        if (eq <= 0) continue
        const key = trimmed.slice(0, eq).trim()
        if (process.env[key] !== undefined) continue
        let val = trimmed.slice(eq + 1).trim()
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1)
        }
        process.env[key] = val
      }
    } catch {
      // ignore unreadable .env files
    }
  }
}

export const webSearchTool = {
  description:
    "Search the web using Google Search. Use this to find current information, news, documentation, or any real-time data. " +
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
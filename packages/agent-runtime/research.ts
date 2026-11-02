type Provider = "contextdev" | "exa" | "firecrawl"
type SearchResult = { title: string; url: string; snippet: string }
const providers: Provider[] = ["contextdev", "exa", "firecrawl"]
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalize(payload: unknown, provider: Provider, limit: number): SearchResult[] | null {
  const root = record(payload)
  if (root.success === false || root.error) return null
  const data = provider === "firecrawl"
    ? Array.isArray(root.data) ? root.data : record(root.data).web
    : root.results
  if (!Array.isArray(data)) return null
  return data.flatMap((entry): SearchResult[] => {
    const item = record(entry)
    if (typeof item.url !== "string" || item.url.length > 2_048) return []
    try {
      const url = new URL(item.url)
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return []
    } catch { return [] }
    const text = (...values: unknown[]) => values.find((value): value is string => typeof value === "string") ?? ""
    const highlights = Array.isArray(item.highlights) ? item.highlights.filter((value) => typeof value === "string").join("\n") : ""
    return [{ title: text(item.title, item.url).slice(0, 300), url: item.url, snippet: text(item.description, item.text, item.snippet, highlights).slice(0, 1_500) }]
  }).slice(0, limit)
}

export async function executeResearchSearch(
  args: Record<string, unknown>,
  options: { token?: string; proxyUrl?: string; signal?: AbortSignal; env?: Record<string, string | undefined>; fetch?: typeof fetch } = {},
): Promise<Record<string, unknown>> {
  options.signal?.throwIfAborted()
  const query = typeof args.query === "string" ? args.query.trim() : ""
  const limit = args.limit === undefined ? 5 : Number(args.limit)
  const preferred = args.provider ?? "auto"
  if (!query || query.length > 2000 || !Number.isInteger(limit) || limit < 1 || limit > 100 || !["auto", ...providers].includes(String(preferred))) return { successful: false, error: "Invalid web search arguments" }
  const env = options.env ?? {}
  const fetcher = options.fetch ?? fetch
  const order = preferred === "auto" ? providers : [preferred as Provider, ...providers.filter((provider) => provider !== preferred)]
  let attempted = false
  let empty: { provider: Provider; results: SearchResult[] } | undefined
  for (const provider of order) {
    const key = provider === "contextdev" ? env.CONTEXT_DEV_API_KEY?.trim() || env.CONTEXTDEV_API_KEY?.trim()
      : provider === "exa" ? env.EXA_API_KEY?.trim() : env.FIRECRAWL_API_KEY?.trim()
    // Reuse the authenticated CLI proxies when keys are hosted on the terminal server.
    if (!key && (!options.token || !options.proxyUrl || provider === "contextdev")) continue
    attempted = true
    const endpoint = key
      ? provider === "contextdev" ? "https://api.context.dev/v1/web/search"
        : provider === "exa" ? "https://api.exa.ai/search" : "https://api.firecrawl.dev/v2/search"
      : `${options.proxyUrl}/api/tools/${provider}-search`
    const headers: Record<string, string> = { "Content-Type": "application/json" }
    if (!key) headers.Authorization = `Bearer ${options.token}`
    else if (provider === "exa") headers["x-api-key"] = key
    else headers.Authorization = `Bearer ${key}`
    try {
      const timeout = AbortSignal.timeout(15_000)
      const response = await fetcher(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(provider === "firecrawl"
          ? { query, limit }
          : { query, numResults: limit, ...(provider === "exa" ? { contents: { text: { maxCharacters: 1_500 } } } : {}) }),
        signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
        cache: "no-store",
        redirect: "error",
      })
      if (!response.ok) continue
      const results = normalize(await response.json(), provider, limit)
      if (!results) continue
      if (results.length) return { successful: true, provider, results }
      empty ??= { provider, results }
    } catch {
      options.signal?.throwIfAborted()
      // Provider errors can include credentials. Never expose raw bodies/errors.
    }
  }
  if (empty) return { successful: true, ...empty }
  return {
    successful: false,
    error: attempted
      ? "Web search providers are unavailable or not configured. Check Context.dev, Exa, or Firecrawl server configuration and retry. No live results were retrieved."
      : "Web search is not configured. Set CONTEXT_DEV_API_KEY (or CONTEXTDEV_API_KEY), EXA_API_KEY, or FIRECRAWL_API_KEY on the server. No live results were retrieved.",
  }
}

import { afterEach, beforeEach, expect, test } from "bun:test"
import { exaSearchTool } from "../../agents/tools/exa_search"
import { firecrawlSearchTool } from "../../agents/tools/firecrawl_search"
import { webSearchTool } from "../../agents/tools/web_search"
import { youcomSearchTool } from "../../agents/tools/youcom_search"

const originalFetch = globalThis.fetch
let exaKey: string | undefined
let firecrawlKey: string | undefined
let ydcKey: string | undefined
beforeEach(() => {
  exaKey = process.env.EXA_API_KEY
  firecrawlKey = process.env.FIRECRAWL_API_KEY
  ydcKey = process.env.YDC_API_KEY
  process.env.EXA_API_KEY = "test-only-placeholder"
  process.env.FIRECRAWL_API_KEY = "test-only-placeholder"
  process.env.YDC_API_KEY = "test-only-placeholder"
})
afterEach(() => {
  globalThis.fetch = originalFetch
  if (exaKey === undefined) delete process.env.EXA_API_KEY
  else process.env.EXA_API_KEY = exaKey
  if (firecrawlKey === undefined) delete process.env.FIRECRAWL_API_KEY
  else process.env.FIRECRAWL_API_KEY = firecrawlKey
  if (ydcKey === undefined) delete process.env.YDC_API_KEY
  else process.env.YDC_API_KEY = ydcKey
})
const parse = (value: unknown) => JSON.parse(String(value))

test("Exa failure falls back to Firecrawl and legacy search preserves links", async () => {
  const urls: string[] = []
  globalThis.fetch = (async (url: string | URL | Request) => {
    urls.push(String(url))
    if (String(url).includes("exa.ai")) return new Response("unavailable", { status: 503 })
    return Response.json({ success: true, data: { web: [{ title: "Docs", url: "https://example.com/docs", description: "Official fixture" }] } })
  }) as typeof fetch
  const result = parse(await webSearchTool.execute({ query: "fixture docs" }))
  expect(result.success).toBe(true)
  expect(result.provider).toBe("firecrawl")
  expect(result.results[0].link).toBe("https://example.com/docs")
  expect(urls).toHaveLength(2)
})

test("Firecrawl fallback forwards domain constraints to Exa", async () => {
  let exaBody: any
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    if (String(url).includes("firecrawl.dev")) return new Response("unavailable", { status: 503 })
    exaBody = JSON.parse(String(options?.body))
    return Response.json({ results: [{ title: "Docs", url: "https://example.com/docs", text: "Fixture" }] })
  }) as typeof fetch
  const result = parse(await firecrawlSearchTool.execute({ query: "fixture", includeDomains: ["example.com"], excludeDomains: ["bad.example.com"] }))
  expect(result.data.provider).toBe("exa")
  expect(exaBody.includeDomains).toEqual(["example.com"])
  expect(exaBody.excludeDomains).toEqual(["bad.example.com"])
})

test("malformed responses fail while valid empty results remain empty", async () => {
  globalThis.fetch = Object.assign(async () => Response.json({ unexpected: true }), { preconnect: originalFetch.preconnect })
  expect(parse(await exaSearchTool.execute({ query: "fixture" })).success).toBe(false)
  globalThis.fetch = Object.assign(async () => Response.json({ results: [] }), { preconnect: originalFetch.preconnect })
  const empty = parse(await exaSearchTool.execute({ query: "fixture" }))
  expect(empty.success).toBe(true)
  expect(empty.data.results).toEqual([])
})

test("youcom_search maps results and reports provider", async () => {
  let hitUrl: string | undefined
  let hitBody: any
  globalThis.fetch = (async (url: string | URL | Request, options?: RequestInit) => {
    hitUrl = String(url)
    hitBody = JSON.parse(String(options?.body))
    return Response.json({ results: { web: [{ title: "Docs", url: "https://example.com/docs", description: "Official fixture" }] } })
  }) as typeof fetch
  const result = parse(await youcomSearchTool.execute({ query: "fixture docs", maxResults: 3 }))
  expect(result.success).toBe(true)
  expect(result.data.provider).toBe("youcom")
  expect(result.data.results[0].link).toBe("https://example.com/docs")
  expect(hitUrl).toContain("api.ydc-index.io/v1/search")
  expect(hitBody.count).toBe(3)
})

test("youcom_search fails cleanly without YDC_API_KEY", async () => {
  delete process.env.YDC_API_KEY
  const result = parse(await youcomSearchTool.execute({ query: "fixture" }))
  expect(result.success).toBe(false)
  expect(result.error).toContain("YDC_API_KEY")
  expect(result.hint).toContain("exa_search")
})

test("youcom_search surfaces auth failures with a hint", async () => {
  globalThis.fetch = Object.assign(async () => new Response("unauthorized", { status: 401 }), { preconnect: originalFetch.preconnect })
  const result = parse(await youcomSearchTool.execute({ query: "fixture" }))
  expect(result.success).toBe(false)
  expect(result.hint).toContain("YDC_API_KEY")
})

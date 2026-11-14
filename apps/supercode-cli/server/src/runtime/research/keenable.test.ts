import { afterEach, beforeEach, expect, mock, test } from "bun:test"
import { isKeenableEnabled, keenableFetch } from "./keenable"
import { keenableSearchTool } from "../../agents/tools/keenable_search"

const originalFetch = globalThis.fetch
let searchFlag: string | undefined
let apiKey: string | undefined

beforeEach(() => {
  searchFlag = process.env.KEENABLE_SEARCH
  apiKey = process.env.KEENABLE_API_KEY
  delete process.env.KEENABLE_SEARCH
  delete process.env.KEENABLE_API_KEY
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (searchFlag === undefined) delete process.env.KEENABLE_SEARCH
  else process.env.KEENABLE_SEARCH = searchFlag
  if (apiKey === undefined) delete process.env.KEENABLE_API_KEY
  else process.env.KEENABLE_API_KEY = apiKey
})

const parse = (value: unknown) => JSON.parse(String(value))

test("Keenable stays off until it is enabled", () => {
  expect(isKeenableEnabled()).toBe(false)
})

test("disabled tool does not call the API", async () => {
  let called = false
  globalThis.fetch = (async () => {
    called = true
    return Response.json({ results: [] })
  }) as unknown as typeof fetch
  const result = parse(await keenableSearchTool.execute({ query: "fixture" }))
  expect(result.success).toBe(false)
  expect(called).toBe(false)
})

test("keyless public endpoint and header when KEENABLE_SEARCH is set", async () => {
  process.env.KEENABLE_SEARCH = "true"
  let url = ""
  let headers: Headers | undefined
  let body = ""
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    url = String(input)
    headers = new Headers(init?.headers)
    body = String(init?.body)
    return Response.json({
      query: "fixture",
      results: [{ title: "Docs", url: "https://docs.keenable.ai/", snippet: "Search API" }],
    })
  }) as unknown as typeof fetch

  const result = parse(await keenableSearchTool.execute({ query: "fixture", maxResults: 3 }))
  expect(result.success).toBe(true)
  expect(url).toBe("https://api.keenable.ai/v1/search/public")
  expect(headers?.get("X-Keenable-Title")).toBe("SuperCLI")
  expect(headers?.get("X-API-Key")).toBeNull()
  expect(JSON.parse(body)).toEqual({ query: "fixture", max_results: 3 })
  expect(result.data.results[0].url).toBe("https://docs.keenable.ai/")
})

test("keyed endpoint when KEENABLE_API_KEY is set", async () => {
  process.env.KEENABLE_API_KEY = "keen_test"
  let url = ""
  let headers: Headers | undefined
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    url = String(input)
    headers = new Headers(init?.headers)
    return Response.json({ query: "q", results: [] })
  }) as unknown as typeof fetch

  const result = await keenableFetch({ query: "q", maxResults: 5 })
  expect(result.ok).toBe(true)
  expect(url).toBe("https://api.keenable.ai/v1/search")
  expect(headers?.get("X-API-Key")).toBe("keen_test")
})

test("proxy fallback rejects a 200 body without a results array", async () => {
  process.env.KEENABLE_API_KEY = "keen_bad"
  mock.module("../stream/proxy-tools", () => ({
    proxyToolCall: async () => ({ ok: true, data: { error: "not search results" } }),
  }))
  globalThis.fetch = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch

  const result = await keenableFetch({ query: "q", maxResults: 5 })
  expect(result.ok).toBe(false)
})

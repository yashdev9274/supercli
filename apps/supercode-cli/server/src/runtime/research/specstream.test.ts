import { afterEach, beforeEach, expect, test } from "bun:test"
import { isSpecStreamEnabled, specstreamFetch } from "./specstream"
import { specstreamSearchTool } from "../../agents/tools/specstream_search"

const originalFetch = globalThis.fetch
let savedKey: string | undefined

beforeEach(() => {
  savedKey = process.env.SPECSTREAM_API_KEY
  delete process.env.SPECSTREAM_API_KEY
})

afterEach(() => {
  globalThis.fetch = originalFetch
  if (savedKey === undefined) delete process.env.SPECSTREAM_API_KEY
  else process.env.SPECSTREAM_API_KEY = savedKey
})

const parse = (value: unknown) => JSON.parse(String(value))

test("SpecStream stays off without SPECSTREAM_API_KEY", () => {
  expect(isSpecStreamEnabled()).toBe(false)
  process.env.SPECSTREAM_API_KEY = "   "
  expect(isSpecStreamEnabled()).toBe(false)
})

test("disabled tool does not call the API", async () => {
  let called = false
  globalThis.fetch = (async () => {
    called = true
    return Response.json({ data: { sources: [] } })
  }) as unknown as typeof fetch
  const result = parse(await specstreamSearchTool.execute({ query: "fixture" }))
  expect(result.success).toBe(false)
  expect(called).toBe(false)
})

test("sends a Bearer GET and maps data.sources", async () => {
  process.env.SPECSTREAM_API_KEY = "ss_test"
  let url = ""
  let init: RequestInit | undefined
  globalThis.fetch = (async (input: string | URL | Request, i?: RequestInit) => {
    url = String(input)
    init = i
    return Response.json({
      data: {
        query: "fixture",
        answer: null,
        sources: [
          { title: "Docs", url: "https://specstream.ai/docs", site: "specstream.ai", snippet: "Search API", cited: true },
          { title: "No URL", snippet: "dropped" },
          { title: "Two", url: "https://b.example", snippet: "second" },
        ],
      },
    })
  }) as unknown as typeof fetch

  const result = parse(await specstreamSearchTool.execute({ query: "fixture", maxResults: 3 }))
  expect(result.success).toBe(true)
  const u = new URL(url)
  expect(u.origin + u.pathname).toBe("https://api.specstream.ai/v1/web-search")
  expect(u.searchParams.get("q")).toBe("fixture")
  expect(u.searchParams.get("num")).toBe("3")
  expect(init?.method).toBe("GET")
  expect(init?.redirect).toBe("manual")
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer ss_test")
  expect(result.data.provider).toBe("specstream")
  expect(result.data.results).toEqual([
    { title: "Docs", snippet: "Search API", url: "https://specstream.ai/docs" },
    { title: "Two", snippet: "second", url: "https://b.example" },
  ])
})

test("clamps num to 1..10", async () => {
  process.env.SPECSTREAM_API_KEY = "ss_test"
  const nums: (string | null)[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    nums.push(new URL(String(input)).searchParams.get("num"))
    return Response.json({ data: { sources: [] } })
  }) as unknown as typeof fetch
  await specstreamFetch({ query: "q", maxResults: 50 })
  await specstreamFetch({ query: "q", maxResults: 0 })
  expect(nums).toEqual(["10", "5"])
})

test("HTTP errors and malformed bodies fail with a hint", async () => {
  process.env.SPECSTREAM_API_KEY = "ss_bad"
  globalThis.fetch = (async () => new Response("{}", { status: 401 })) as unknown as typeof fetch
  const denied = await specstreamFetch({ query: "q" })
  expect(denied.ok).toBe(false)
  expect(denied.status).toBe(401)
  expect(denied.hint).toContain("SPECSTREAM_API_KEY")

  globalThis.fetch = (async () => Response.json({ error: "not search results" })) as unknown as typeof fetch
  const malformed = await specstreamFetch({ query: "q" })
  expect(malformed.ok).toBe(false)
  expect(malformed.error).toContain("malformed")
})

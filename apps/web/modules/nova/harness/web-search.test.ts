import { expect, test } from "bun:test"

import { streamHarnessAgent, type ChatTransport } from "./agent"
import { executeWebSearch, webSearchHarnessTools } from "./web-search"

const hit = { title: "Context", url: "https://context.dev/docs", description: "Current documentation" }
function transport(handler: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((input: unknown, init?: RequestInit) => Promise.resolve(handler(String(input), init))) as typeof fetch
}

test("Context.dev uses server configuration and bounded results", async () => {
  const result = await executeWebSearch({ query: " context.dev ", limit: 1 }, {
    env: { CONTEXT_DEV_API_KEY: "fixture-key" },
    fetch: transport((url, init) => {
      expect(url).toBe("https://api.context.dev/v1/web/search")
      expect(JSON.parse(String(init?.body))).toEqual({ query: "context.dev", numResults: 1 })
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-key")
      return Response.json({ results: [hit, hit] })
    }),
  })
  expect(result).toEqual({ successful: true, provider: "contextdev", results: [{ title: hit.title, url: hit.url, snippet: hit.description }] })
})

test("falls back from Context.dev and Exa to Firecrawl v2", async () => {
  const urls: string[] = []
  const result = await executeWebSearch({ query: "context.dev" }, {
    env: { CONTEXTDEV_API_KEY: "fixture", EXA_API_KEY: "fixture", FIRECRAWL_API_KEY: "fixture" },
    fetch: transport((url) => {
      urls.push(url)
      return url.includes("firecrawl") ? Response.json({ success: true, data: { web: [hit] } }) : Response.json({}, { status: 503 })
    }),
  })
  expect(urls).toHaveLength(3)
  expect(result.provider).toBe("firecrawl")
  expect(result.successful).toBe(true)
})

test("preferred Exa provider gets text contents and legacy Firecrawl arrays normalize", async () => {
  const result = await executeWebSearch({ query: "docs", provider: "exa" }, {
    env: { EXA_API_KEY: "fixture", FIRECRAWL_API_KEY: "fixture" },
    fetch: transport((url, init) => {
      if (url.includes("exa")) {
        expect(JSON.parse(String(init?.body)).contents.text.maxCharacters).toBe(1500)
        return Response.json({ results: [] })
      }
      return Response.json({ data: [hit] })
    }),
  })
  expect(result.provider).toBe("firecrawl")
})

test("reuses terminal proxies with a CLI session when Nova has no keys", async () => {
  const result = await executeWebSearch({ query: "docs" }, {
    env: {}, token: "fixture-session",
    fetch: transport((url, init) => {
      expect(url.endsWith("/api/tools/exa-search")).toBe(true)
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer fixture-session")
      return Response.json({ results: [hit] })
    }),
  })
  expect(result.provider).toBe("exa")
})

test("invalid inputs and missing configuration do not fetch", async () => {
  const fetch = transport(() => { throw new Error("Must not fetch") })
  expect((await executeWebSearch({ query: " " }, { env: {}, fetch })).successful).toBe(false)
  expect((await executeWebSearch({ query: "docs", limit: 100 }, { env: {}, fetch })).successful).toBe(false)
  expect((await executeWebSearch({ query: "docs" }, { env: {}, fetch })).error).toContain("not configured")
})

test("raw upstream errors are never exposed", async () => {
  const result = await executeWebSearch({ query: "docs" }, {
    env: { EXA_API_KEY: "fixture" },
    fetch: transport(() => { throw new Error("sensitive-upstream-detail") }),
  })
  expect(result.successful).toBe(false)
  expect(JSON.stringify(result)).not.toContain("sensitive-upstream-detail")
})

test("cancellation propagates without trying another provider", async () => {
  const controller = new AbortController()
  let count = 0
  await expect(executeWebSearch({ query: "docs" }, {
    env: { EXA_API_KEY: "fixture", FIRECRAWL_API_KEY: "fixture" }, signal: controller.signal,
    fetch: transport(() => { count++; controller.abort(); throw new Error("cancelled") }),
  })).rejects.toThrow()
  expect(count).toBe(1)
})

test("filters unsafe citation URLs and bounds snippets", async () => {
  const result = await executeWebSearch({ query: "docs" }, {
    env: { EXA_API_KEY: "fixture" },
    fetch: transport(() => Response.json({ results: [{ ...hit, url: "javascript:alert(1)" }, { ...hit, description: "x".repeat(4000) }] })),
  })
  expect(result.results).toEqual([{ title: hit.title, url: hit.url, snippet: "x".repeat(1500) }])
})

for (const mode of ["chat", "plan", "agent"]) {
  test(`search tool executes and feeds sources back in ${mode} without connected apps`, async () => {
    let round = 0
    const chatTransport: ChatTransport = async function* (input) {
      expect(input.tools?.some((tool) => tool.function.name === "nova_web_search")).toBe(true)
      if (round++ === 0) {
        yield { type: "tool-call", toolName: "nova_web_search", toolCallId: "search", args: { query: "context.dev" } }
        yield { type: "finish", reason: "tool_calls" }
      } else {
        expect(input.messages.some((message) => message.role === "tool" && String(message.content).includes(hit.url))).toBe(true)
        yield { type: "text", content: `Source: ${hit.url}` }
      }
    }
    const events = []
    for await (const event of streamHarnessAgent({
      token: "", provider: "fixture", model: "fixture", mode, skipConnectedTools: true,
      isolatedTools: mode === "agent", messages: [{ role: "user", content: "web search about context.dev" }],
      extraTools: webSearchHarnessTools(), chatTransport,
      executeExtraTool: async () => ({ successful: true, results: [hit] }),
    })) events.push(event)
    expect(events.some((event) => event.type === "tool-result" && event.status === "completed")).toBe(true)
    expect(round).toBe(2)
  })
}

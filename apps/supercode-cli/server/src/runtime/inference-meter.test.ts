import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { clientInferenceKey, createInferenceFetch, inferenceErrorStatus } from "./inference-meter"
import { computeCost, lookupPricing } from "../lib/pricing"

function harness(overrides: Partial<Parameters<typeof createInferenceFetch>[0]> = {}) {
  const events: string[] = []
  const reservations: any[] = []
  const settlements: any[] = []
  const requests: any[] = []
  const reservation = { id: "reservation", status: "reserved", reservedMicrocredits: 100, replayed: false } as any
  const fetch = createInferenceFetch({
    userId: "user",
    provider: "concentrateai",
    maxOutputTokens: () => 8192,
    planGate: async (_user, _model, opts) => {
      events.push("gate")
      requests.push(opts)
      return { allowed: true, plan: { tier: "spark" } } as any
    },
    reserve: async (...args) => {
      events.push("reserve")
      reservations.push(args)
      return reservation
    },
    settle: async (...args) => {
      events.push("settle")
      settlements.push(args)
      return reservation
    },
    settleUnknown: async (...args) => {
      events.push("unknown")
      settlements.push(args)
      return reservation
    },
    fetcher: (async (_url, init) => {
      events.push("fetch")
      requests.push(JSON.parse(init!.body as string))
      return Response.json({ usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 60 } } })
    }) as typeof globalThis.fetch,
    ...overrides,
  })
  const send = (body: Record<string, unknown> = {}, signal?: AbortSignal) => fetch("https://provider.test/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "deepseek-v4-flash", messages: [{ role: "user", content: "hello" }], max_tokens: 90000, ...body }),
    signal,
  })
  return { send, events, reservations, settlements, requests }
}

describe("hosted inference reservations", () => {
  test("reserves before dispatch, caps output and durably settles cached usage", async () => {
    const h = harness()
    const response = await h.send()
    expect(response.ok).toBe(true)
    expect(h.events).toEqual(["gate", "reserve", "fetch", "settle"])
    expect(h.reservations[0][2].maxOutputTokens).toBe(8192)
    expect(h.requests[1].max_tokens).toBe(8192)
    expect(h.settlements[0]).toEqual(["reservation", "deepseek-v4-flash", { inputTokens: 100, outputTokens: 20, cachedInputTokens: 60 }])
  })

  test("a provider name alone never exempts hosted usage", async () => {
    const h = harness({ provider: "google" })
    await h.send()
    expect(h.reservations).toHaveLength(1)
    expect(h.requests[1].generationConfig.maxOutputTokens).toBe(8192)
    expect(clientInferenceKey({ provider: "google", concentrateAiKey: "user-key" })).toBeUndefined()
    expect(clientInferenceKey({ provider: "concentrateai", concentrateAiKey: {} })).toBeUndefined()
    expect(clientInferenceKey({ provider: "concentrateai", concentrateAiKey: "  " })).toBeUndefined()
    expect(clientInferenceKey({ provider: "concentrateai", concentrateAiKey: " user-key " })).toBe("user-key")
  })

  test("actual client keys skip all credit writes", async () => {
    const h = harness({ clientKey: "client-key" })
    await h.send()
    expect(h.events).toEqual(["gate", "fetch"])
  })

  for (const statusCode of [402, 503]) test(`does not dispatch if reservation fails with ${statusCode}`, async () => {
    const h = harness({ reserve: async () => { throw Object.assign(new Error("denied"), { statusCode }) } })
    await expect(h.send()).rejects.toThrow("denied")
    expect(h.events).toEqual(["gate"])
    expect(inferenceErrorStatus({ statusCode })).toBe(statusCode)
  })

  test("validates output before reserving or dispatching", async () => {
    const h = harness()
    await expect(h.send({ max_tokens: -1 })).rejects.toThrow("Invalid output")
    expect(h.events).toEqual([])
  })

  test("refunds a reservation when canceled before dispatch", async () => {
    const abort = new AbortController()
    const h = harness({ reserve: async () => {
      abort.abort()
      return { id: "reservation", reservedMicrocredits: 100 } as any
    } })
    await expect(h.send({}, abort.signal)).rejects.toThrow()
    expect(h.events).toEqual(["gate", "settle"])
    expect(h.settlements[0][2]).toEqual({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 })
  })

  test("retains the full reserve after a dispatched network failure", async () => {
    const h = harness({ fetcher: (async () => { throw new Error("network") }) as any })
    await expect(h.send()).rejects.toThrow("network")
    expect(h.events).toEqual(["gate", "reserve", "unknown"])
  })

  test("refunds rejected HTTP calls and reserves each retry separately", async () => {
    const h = harness({ fetcher: (async () => new Response("limited", { status: 429 })) as any })
    expect((await h.send()).status).toBe(429)
    await h.send()
    expect(h.reservations).toHaveLength(2)
    expect(h.settlements).toHaveLength(2)
    expect(h.settlements[0][2]).toEqual({ inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 })
  })

  test("permits a full native context without confusing bytes with tokens", async () => {
    const h = harness()
    await h.send({ messages: [{ role: "user", content: "text".repeat(1_000_000) }] })
    expect(h.reservations[0][2].inputTokens).toBe(1_048_576)
    expect(h.requests[0].nativeDeepSeek).toBe(true)
    const other = harness({ provider: "openrouter" })
    await other.send({ model: "deepseek/deepseek-v4-flash" })
    expect(other.requests[0].nativeDeepSeek).toBe(false)
  })

  test("never completes successfully when durable settlement fails", async () => {
    const h = harness({ settle: async () => { throw new Error("ledger unavailable") } })
    await expect(h.send()).rejects.toThrow("ledger unavailable")
    expect(h.events).not.toContain("unknown")
  })

  for (const provider of ["concentrateai", "supercode"]) {
    for (const model of ["deepseek-v4-flash", "deepseek/deepseek-v4-flash"]) {
      test(`permits full context for exact native ${provider}/${model}`, async () => {
        const h = harness({ provider })
        await h.send({ model, messages: [{ role: "user", content: "text".repeat(1_000_000) }] })
        expect(h.requests[0].nativeDeepSeek).toBe(true)
        expect(h.reservations[0][2].inputTokens).toBe(1_048_576)
      })
    }
  }

  test("does not grant native context to a lookalike model name", async () => {
    const h = harness()
    await h.send({ model: "deepseek/deepseek-v4-flash-other" })
    expect(h.requests[0].nativeDeepSeek).toBe(false)
  })
})

describe("provider usage protocols", () => {
  for (const [data, expected] of [
    [{ usage: { prompt_tokens: 100, completion_tokens: 30, prompt_tokens_details: { cached_tokens: 40 } } }, { inputTokens: 100, outputTokens: 30, cachedInputTokens: 40 }],
    [{ usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 10, cachedContentTokenCount: 40 } }, { inputTokens: 100, outputTokens: 30, cachedInputTokens: 40 }],
    [{ usage: { input_tokens: 50, output_tokens: 30, cache_read_input_tokens: 40, cache_creation_input_tokens: 10 } }, { inputTokens: 100, outputTokens: 30, cachedInputTokens: 40 }],
  ]) test("settles a JSON provider response", async () => {
    const h = harness({ fetcher: (async () => Response.json(data)) as any })
    await h.send()
    expect(h.settlements[0][2]).toEqual(expected)
  })

  test("handles split streaming usage and awaits settlement before EOF", async () => {
    const chunks = ['data: {"choices":[{"delta":{"content":"hello"}}]}\n\n', 'data: {"usage":{"prompt_tokens":100,', '"completion_tokens":20,"prompt_tokens_details":{"cached_tokens":60}}}\n\ndata: [DONE]\n\n']
    const h = harness({ fetcher: (async () => new Response(new ReadableStream({ pull(controller) {
      const chunk = chunks.shift()
      if (chunk) controller.enqueue(new TextEncoder().encode(chunk))
      else controller.close()
    } }), { headers: { "content-type": "text/event-stream" } })) as any })
    const response = await h.send({ stream: true })
    expect(h.settlements).toHaveLength(0)
    await response.text()
    expect(h.settlements[0][2]).toEqual({ inputTokens: 100, outputTokens: 20, cachedInputTokens: 60 })
    expect(h.events.at(-1)).toBe("settle")
  })

  test("charges the bound for absent usage and canceled streams", async () => {
    const absent = harness({ fetcher: (async () => Response.json({ choices: [] })) as any })
    await absent.send()
    expect(absent.events.at(-1)).toBe("unknown")
    const h = harness({ fetcher: (async () => new Response(new ReadableStream({ pull(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"choices":[]}\n\n'))
    } }), { headers: { "content-type": "text/event-stream" } })) as any })
    const response = await h.send({ stream: true })
    const reader = response.body!.getReader()
    await reader.read()
    await reader.cancel()
    expect(h.events.at(-1)).toBe("unknown")
    expect(h.settlements).toHaveLength(1)
  })

  test("settles actual counters on cancellation once usage has arrived", async () => {
    const h = harness({ fetcher: (async () => new Response(new ReadableStream({ pull(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"usage":{"prompt_tokens":100,"completion_tokens":20,"prompt_cache_hit_tokens":50}}\n\n'))
    } }), { headers: { "content-type": "text/event-stream" } })) as any })
    const response = await h.send({ stream: true })
    const reader = response.body!.getReader()
    await reader.read()
    await reader.cancel()
    expect(h.events.at(-1)).toBe("settle")
    expect(h.settlements[0][2]).toEqual({ inputTokens: 100, outputTokens: 20, cachedInputTokens: 50 })
  })

  test("every internal continuation gets its own reserve and settlement", async () => {
    const h = harness()
    await h.send()
    await h.send({ messages: [{ role: "user", content: "tool results follow" }] })
    expect(h.events).toEqual(["gate", "reserve", "fetch", "settle", "gate", "reserve", "fetch", "settle"])
    expect(h.reservations).toHaveLength(2)
  })
})

describe("cache-aware pricing", () => {
  test("cached input is a subset rather than a second input charge", () => {
    expect(computeCost("openai/gpt-4o-mini", 1_000_000, 0, 400_000)).toBeCloseTo(0.12)
    expect(computeCost("openai/gpt-4o-mini", 100, 0, 200)).toBeCloseTo(0.0000075)
    expect(lookupPricing("gpt-4o")).toBeNull()
    expect(lookupPricing("")).toBeNull()
    expect(lookupPricing("__proto__")).toBeNull()
  })

  test("validates explicitly configured rates and never silently uses bad values", () => {
    const before = process.env.BILLING_MODEL_RATES_JSON
    try {
      process.env.BILLING_MODEL_RATES_JSON = JSON.stringify({ "custom-model": { inputPrice: 1, outputPrice: 2, cachedPrice: 0.5 } })
      expect(lookupPricing("custom-model")?.inputPrice).toBe(1)
      process.env.BILLING_MODEL_RATES_JSON = '{"custom-model":{"inputPrice":-1}}'
      expect(() => lookupPricing("custom-model")).toThrow("BILLING_MODEL_RATES_JSON")
    } finally {
      if (before === undefined) delete process.env.BILLING_MODEL_RATES_JSON
      else process.env.BILLING_MODEL_RATES_JSON = before
    }
  })
})

describe("hosted tool route wiring", () => {
  const source = readFileSync(new URL("../index.ts", import.meta.url), "utf8")

  test("all hosted tool proxy routes authenticate and meter dispatch", () => {
    const routes = [...source.matchAll(/app\.post\("\/api\/tools\/([^\"]+)"[\s\S]*?(?=\napp\.post|$)/g)]
    expect(routes).toHaveLength(6)
    for (const route of routes) {
      expect(route[0]).toContain("getUserFromBearer(req)")
      expect(route[0]).toContain(`withToolCredits(user.id, "${route[1]!.replaceAll("-", "_")}", () => globalThis.fetch(`)
      expect(route[0]).toContain("inferenceErrorStatus(error)")
    }
  })

  test("voice tool calls do not enter the inference fetch wrapper", () => {
    const voice = source.slice(source.indexOf('app.post("/api/voice/chat"'))
    expect(voice).toContain('withToolCredits(user.id, "firecrawl_search", () => globalThis.fetch(')
    expect(voice).toContain("runWebSearch(user.id, query, numResults, fnName)")
    expect(voice).toContain("withToolCredits(user.id, fnName, () => composio.tools.execute(")
    expect(voice).toContain("withToolCredits(user.id, pending.slug, () => composio.tools.execute(")
    expect(voice.match(/composio\.tools\.execute\(/g)).toHaveLength(2)
  })

  test("server-owned Composio credentials and voice sessions use authenticated identity", () => {
    const voice = source.slice(source.indexOf('app.post("/api/voice/chat"'))
    expect(voice).toContain('const composioIdentity = clientComposioKey && typeof composioUserId === "string" ? composioUserId : user.id')
    expect(voice).toContain(".list({ userIds: [composioIdentity] })")
    expect(voice).not.toContain(".list({})")
    expect(voice).toContain("getVoiceSession(user.id)")
  })
})

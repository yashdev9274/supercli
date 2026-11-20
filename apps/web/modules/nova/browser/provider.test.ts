import { describe, expect, test } from "bun:test"

import { createBrowserbaseProvider, validateProviderUrl } from "./provider"
import { BrowserCreationRejectedError } from "./contracts"

describe("Browserbase creation failures", () => {
  for (const [status, detail, expected] of [
    [401, "secret response", "rejected the API key"],
    [403, "keepAlive requires a paid plan", "paid plan with keep-alive"],
    [404, "project missing", "denied access"],
    [429, "concurrency exceeded", "concurrency or usage limit"],
    [400, "invalid projectId", "rejected the session settings"],
  ] as const) {
    test(`classifies HTTP ${status} without exposing provider bodies`, async () => {
      const provider = createBrowserbaseProvider({ apiKey: "test", projectId: "test" }, async () => new Response(detail, { status }))
      const error = await provider.create("claim").catch((error: unknown) => error)
      expect(error).toBeInstanceOf(BrowserCreationRejectedError)
      expect((error as Error).message).toContain(expected)
      expect((error as Error).message).not.toContain(detail)
    })
  }

  test("transport and server failures remain ambiguous and are not retried", async () => {
    for (const fail of [async () => { throw new Error("secret connection details") }, async () => new Response("secret", { status: 503 })]) {
      let calls = 0
      const provider = createBrowserbaseProvider({ apiKey: "test", projectId: "test" }, async () => { calls++; return fail() })
      const error = await provider.create("claim").catch((error: unknown) => error)
      expect(error).toBeInstanceOf(Error)
      expect(error).not.toBeInstanceOf(BrowserCreationRejectedError)
      expect((error as Error).message).not.toContain("secret")
      expect(calls).toBe(1)
    }
  })

  test("trims credentials and gives creation a longer bounded timeout", async () => {
    const signals: AbortSignal[] = []
    const provider = createBrowserbaseProvider({ apiKey: " test-key \n", projectId: " test-project \n" }, async (_url, options) => {
      expect((options?.headers as Record<string, string>)["X-BB-API-Key"]).toBe("test-key")
      const body = JSON.parse(String(options?.body))
      expect(body.projectId).toBe("test-project")
      expect(body.keepAlive).toBe(true)
      if (options?.signal) signals.push(options.signal)
      return Response.json({ id: "test-session" })
    })
    expect(await provider.create("claim")).toEqual({ id: "test-session" })
    expect(signals[0]).toBeInstanceOf(AbortSignal)
    expect(signals[0].aborted).toBe(false)
  })
})

describe("Browserbase interactive view", () => {
  test("uses browser chrome instead of the fullscreen viewport", async () => {
    const provider = createBrowserbaseProvider({ apiKey: "test", projectId: "test" }, async () => Response.json({
      debuggerUrl: "https://www.browserbase.com/devtools/inspector.html?wss=test",
      debuggerFullscreenUrl: "https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=test",
    }))
    expect(await provider.liveView("test-session")).toBe("https://www.browserbase.com/devtools/inspector.html?wss=test")
  })

  test("validates both provider view paths without permitting arbitrary pages", () => {
    for (const path of ["devtools", "devtools-fullscreen"]) {
      const url = `https://www.browserbase.com/${path}/inspector.html?wss=test`
      expect(validateProviderUrl(url, "live")).toBe(url)
    }
    expect(() => validateProviderUrl("https://www.browserbase.com/login", "live")).toThrow()
    expect(() => validateProviderUrl("https://evil.test/devtools/inspector.html", "live")).toThrow()
  })
})

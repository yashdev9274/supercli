import { describe, expect, test } from "bun:test"

import { createBrowserbaseProvider, validateProviderUrl } from "./provider"

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

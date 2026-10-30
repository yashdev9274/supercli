import { describe, expect, test } from "bun:test"

import { browserLiveViewUrl } from "./browser-view"

describe("Browserbase Live View URL", () => {
  test("accepts the documented HTTPS devtools surface", () => {
    expect(browserLiveViewUrl("https://www.browserbase.com/devtools/inspector.html?sessionId=test")).toBe("https://www.browserbase.com/devtools/inspector.html?sessionId=test")
  })
  test("accepts the fullscreen surface returned by Browserbase", () => {
    expect(browserLiveViewUrl("https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=test")).toBe("https://www.browserbase.com/devtools-fullscreen/inspector.html?wss=test")
  })
  test("rejects other origins, credentials, ports, scripts and paths", () => {
    for (const value of [null, "javascript:alert(1)", "http://www.browserbase.com/devtools/a", "https://www.browserbase.com.evil.test/devtools/a", "https://evil.test/devtools/a", "https://user:pass@www.browserbase.com/devtools/a", "https://www.browserbase.com:444/devtools/a", "https://www.browserbase.com/login"]) {
      expect(browserLiveViewUrl(value)).toBeNull()
    }
  })
})

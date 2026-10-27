import { describe, expect, test } from "bun:test"

import { contrastingText, DEFAULT_CHAT_APPEARANCE, parseChatAppearance } from "./chat-appearance"

describe("chat appearance", () => {
  test("uses defaults for missing or corrupt preferences", () => {
    for (const raw of [null, "bad json", "null", "42"]) {
      expect(parseChatAppearance(raw)).toEqual(DEFAULT_CHAT_APPEARANCE)
    }
  })

  test("restores custom colors", () => {
    const appearance = { background: "#f1eee7", ascii: "#786c58", text: "#123456" }
    expect(parseChatAppearance(JSON.stringify(appearance))).toEqual(appearance)
  })

  test("rejects invalid stored colors independently", () => {
    expect(parseChatAppearance(JSON.stringify({ background: "red", ascii: "#abcdef", text: "url(invalid)" }))).toEqual({
      ...DEFAULT_CHAT_APPEARANCE,
      ascii: "#abcdef",
    })
  })

  test("selects contrasting text for dark, light, and midtone backgrounds", () => {
    expect(contrastingText("#101010")).toBe("#ffffff")
    expect(contrastingText("#f1eee7")).toBe("#000000")
    expect(contrastingText("#777777")).toBe("#000000")
    expect(contrastingText("#0c211b")).toBe("#ffffff")
  })
})

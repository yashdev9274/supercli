import { describe, expect, test } from "bun:test"
import {
  hasTools,
  prepareMessages,
  friendlyGatewayError,
} from "../stream-helpers.ts"

describe("stream-helpers", () => {
  test("hasTools", () => {
    expect(hasTools(undefined)).toBe(false)
    expect(hasTools({})).toBe(false)
    expect(hasTools({ read_file: {} })).toBe(true)
  })

  test("prepareMessages splits system", () => {
    const { system, messages } = prepareMessages([
      { role: "system", content: "a" },
      { role: "system", content: "b" },
      { role: "user", content: "hi" },
    ] as any)
    expect(system).toBe("a\nb")
    expect(messages).toHaveLength(1)
    expect(messages[0]!.role).toBe("user")
  })

  test("friendlyGatewayError detects 5xx", () => {
    const err = friendlyGatewayError("OrcaRouter", new Error("OrcaRouter API 503 boom"))
    expect(err).toBeTruthy()
    expect(err!.message).toContain("gateway error")
    expect(friendlyGatewayError("OrcaRouter", new Error("bad request 400"))).toBeNull()
  })
})

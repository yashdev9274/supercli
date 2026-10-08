import { afterEach, beforeEach, describe, expect, test } from "bun:test"

import { createOAuthState, verifyOAuthState } from "./oauth-state"

const originalSecret = process.env.BETTER_AUTH_SECRET

describe("Composio OAuth state", () => {
  beforeEach(() => {
    process.env.BETTER_AUTH_SECRET = "test-state-secret"
  })

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.BETTER_AUTH_SECRET
    else process.env.BETTER_AUTH_SECRET = originalSecret
  })

  test("preserves the Desktop return target for GitHub", () => {
    const state = createOAuthState("user_1", "github", "desktop")
    expect(verifyOAuthState(state, "github")).toEqual({
      userId: "user_1",
      returnTo: "desktop",
    })
    expect(verifyOAuthState(state, "slack")).toBeNull()
  })

  test("preserves the Nova return target for Linear", () => {
    const state = createOAuthState("user_2", "linear", "nova")
    expect(verifyOAuthState(state, "linear")).toEqual({
      userId: "user_2",
      returnTo: "nova",
    })
  })

  test("rejects a modified signature", () => {
    const state = createOAuthState("user_1", "slack", "web")
    expect(verifyOAuthState(`${state}changed`, "slack")).toBeNull()
  })
})

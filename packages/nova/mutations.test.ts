import { describe, expect, test } from "bun:test"

import {
  canonicalJson,
  mutationPreview,
  normalizedArgsHash,
  parseMutationArguments,
} from "./mutations"

describe("Nova mutation argument binding", () => {
  test("canonicalizes object keys recursively", () => {
    const first = { text: "hello", target: { thread: "1", channel: "C1" } }
    const second = { target: { channel: "C1", thread: "1" }, text: "hello" }

    expect(canonicalJson(first)).toBe(canonicalJson(second))
    expect(normalizedArgsHash(first)).toBe(normalizedArgsHash(second))
  })

  test("binds changed values to a different hash", () => {
    expect(normalizedArgsHash({ text: "hello" })).not.toBe(
      normalizedArgsHash({ text: "hello!" }),
    )
  })

  test("rejects values outside JSON", () => {
    expect(() => canonicalJson({ value: Number.NaN })).toThrow("finite numbers")
    expect(() => canonicalJson({ value: 1n })).toThrow("unsupported bigint")
  })
})

describe("typed mutation arguments", () => {
  test("parses and previews the exact approved GitHub comment", () => {
    const args = parseMutationArguments("github.comment", {
      surfaceId: "surface_1",
      connectedAccountId: "account_1",
      repository: "acme/api",
      issueNumber: 42,
      text: "Review complete",
    })
    expect(mutationPreview("github.comment", args)).toEqual({
      tool: "github.comment",
      text: "Review complete",
      target: { repository: "acme/api", issueNumber: 42 },
    })
  })

  test("binds approval hashes to the Composio connected account", () => {
    const base = {
      surfaceId: "surface_1",
      connectedAccountId: "account_1",
      repository: "acme/api",
      issueNumber: 42,
      text: "Review complete",
    }
    expect(normalizedArgsHash(base)).not.toBe(normalizedArgsHash({
      ...base,
      connectedAccountId: "account_2",
    }))
  })

  test("rejects cross-tool, unsafe, and unknown arguments", () => {
    expect(() => parseMutationArguments("slack.reply", {
      surfaceId: "surface_1",
      connectedAccountId: "account_1",
      repository: "acme/api",
      issueNumber: 42,
      text: "Wrong target",
    })).toThrow()
    expect(() => parseMutationArguments("github.comment", {
      surfaceId: "surface_1",
      connectedAccountId: "account_1",
      repository: "acme/api",
      issueNumber: Number.MAX_SAFE_INTEGER + 1,
      text: "Unsafe issue number",
    })).toThrow()
    expect(() => parseMutationArguments("linear.reply", {
      surfaceId: "surface_1",
      connectedAccountId: "account_1",
      agentSessionId: "agent_session_1",
      issueId: "issue_1",
      text: "Hello",
      unexpected: true,
    })).toThrow()
  })
})

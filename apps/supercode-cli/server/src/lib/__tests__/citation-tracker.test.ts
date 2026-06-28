import { describe, test, expect } from "bun:test"
import { CitationTracker } from "../citation-tracker"

describe("CitationTracker", () => {
  test("records URL fetches and file reads", () => {
    const t = new CitationTracker()
    t.recordFromToolCall("url_fetch", { url: "https://example.com/docs" })
    t.recordFromToolCall("read_file", { path: "src/auth.ts" })
    expect(t.urls()).toEqual(["https://example.com/docs"])
    expect(t.files()).toEqual(["src/auth.ts"])
  })

  test("records web_search queries", () => {
    const t = new CitationTracker()
    t.recordFromToolCall("web_search", { query: "opencode agent architecture" })
    expect(t.all()[0]!.kind).toBe("search")
  })

  test("does NOT flag URLs that were actually fetched", () => {
    const t = new CitationTracker()
    t.recordFromToolCall("url_fetch", { url: "https://example.com/docs" })
    const response = "According to https://example.com/docs/page, ..."
    expect(t.suspectClaims(response)).toEqual([])
  })

  test("flags URLs in response that were never fetched", () => {
    const t = new CitationTracker()
    const response =
      "OpenAI's API docs at https://platform.openai.com/docs say GPT-5 is fast."
    const suspects = t.suspectClaims(response)
    expect(suspects.some((s) => s.includes("platform.openai.com"))).toBe(true)
  })

  test("flags file paths in response that were never read", () => {
    const t = new CitationTracker()
    const response = "The bug is in src/auth/session.ts on line 42."
    const suspects = t.suspectClaims(response)
    expect(suspects.some((s) => s.includes("src/auth/session.ts"))).toBe(true)
  })

  test("does not flag file paths inside code blocks", () => {
    const t = new CitationTracker()
    const response = "```ts\n// src/foo.ts\nimport { x } from 'y'\n```"
    expect(t.suspectClaims(response)).toEqual([])
  })

  test("buildCitationSentinel returns null when no suspects", () => {
    const t = new CitationTracker()
    t.recordFromToolCall("url_fetch", { url: "https://example.com" })
    expect(t.buildCitationSentinel("see https://example.com")).toBeNull()
  })

  test("buildCitationSentinel returns a message when there are suspects", () => {
    const t = new CitationTracker()
    const response = "GPT-5 was released on https://example.com/fake on 2026-01-01"
    const sentinel = t.buildCitationSentinel(response)
    expect(sentinel).not.toBeNull()
    expect(sentinel).toContain("Suspect claims")
    expect(sentinel).toContain("uncited URL")
  })

  test("reset clears citations", () => {
    const t = new CitationTracker()
    t.recordFromToolCall("read_file", { path: "x" })
    t.reset()
    expect(t.all()).toEqual([])
  })
})
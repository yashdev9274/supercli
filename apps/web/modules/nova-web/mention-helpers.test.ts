import { describe, expect, test } from "bun:test"

import type { NovaReference } from "../nova/references/contracts"

import {
  addReference,
  filterReferenceCategories,
  insertMentionTrigger,
  MAX_REFERENCES,
  moveMentionIndex,
  parseMentionQuery,
  replaceMentionQuery,
} from "./mention-helpers"

describe("parseMentionQuery", () => {
  test("opens for a bare @ and whitespace boundaries", () => {
    expect(parseMentionQuery("@", 1)).toEqual({ start: 0, end: 1, query: "" })
    expect(parseMentionQuery("Explain @file", 13)).toEqual({ start: 8, end: 13, query: "file" })
    expect(parseMentionQuery("(@file", 6)).toEqual({ start: 1, end: 6, query: "file" })
    expect(parseMentionQuery("hello\n@", 7)).toEqual({ start: 6, end: 7, query: "" })
  })

  test("does not treat email addresses or inline @ as mentions", () => {
    expect(parseMentionQuery("nova@example.com", 16)).toBeNull()
    expect(parseMentionQuery("repo/@file", 10)).toBeNull()
    expect(parseMentionQuery("@@", 2)).toBeNull()
    expect(parseMentionQuery("@file\nnext", 10)).toBeNull()
  })

  test("reads only up to the caret and supports titles with spaces", () => {
    expect(parseMentionQuery("Review @Fix auth redirect please", 25)).toEqual({
      start: 7,
      end: 25,
      query: "Fix auth redirect",
    })
    expect(parseMentionQuery("@docs/User guide.md", 19)?.query).toBe("docs/User guide.md")
    expect(parseMentionQuery("@old @new", 9)).toEqual({ start: 5, end: 9, query: "new" })
  })

  test("ignores noncollapsed selections and invalid caret positions", () => {
    expect(parseMentionQuery("@foo", 1, 4)).toBeNull()
    expect(parseMentionQuery("@foo", 0)).toBeNull()
    expect(parseMentionQuery("@foo", -1)).toBeNull()
    expect(parseMentionQuery("@foo", 5)).toBeNull()
    expect(parseMentionQuery("text", 4)).toBeNull()
  })
})

describe("mention edits", () => {
  test("removes just the query range and restores the caret before preserved suffix text", () => {
    const value = "Explain @User guide.md and this"
    const mention = parseMentionQuery(value, 22)!
    expect(replaceMentionQuery(value, mention, "")).toEqual({ value: "Explain  and this", caret: 8 })
    expect(replaceMentionQuery(value, mention, "@")).toEqual({ value: "Explain @ and this", caret: 9 })
  })

  test("inserts an attach-button trigger at the caret or selected range", () => {
    expect(insertMentionTrigger("hello", 5)).toEqual({ value: "hello @", caret: 7 })
    expect(insertMentionTrigger("hello world", 6, 11)).toEqual({ value: "hello @", caret: 7 })
    expect(insertMentionTrigger("(hello)", 1)).toEqual({ value: "(@hello)", caret: 2 })
    expect(insertMentionTrigger("", 0)).toEqual({ value: "@", caret: 1 })
  })
})

describe("reference picker state helpers", () => {
  const reference: NovaReference = { kind: "files", id: "file-1", label: "guide.md", description: "repo" }

  test("deduplicates by kind and id without changing the existing reference", () => {
    const references = [reference]
    expect(addReference(references, { ...reference, label: "renamed.md" })).toEqual({
      references,
      status: "duplicate",
    })
    expect(addReference(references, { ...reference, kind: "threads" }).status).toBe("added")
  })

  test("enforces the limit but accepts an already attached item at capacity", () => {
    const references = Array.from({ length: MAX_REFERENCES }, (_, index) => ({ ...reference, id: `file-${index}` }))
    expect(addReference(references, { ...reference, id: "new" }).status).toBe("limit")
    expect(addReference(references, reference).status).toBe("duplicate")
    expect(addReference(references.slice(1), { ...reference, id: "new" }).references).toHaveLength(MAX_REFERENCES)
  })

  test("filters all six categories without requesting results", () => {
    expect(filterReferenceCategories("")).toHaveLength(6)
    expect(filterReferenceCategories("  FILE ").map((category) => category.kind)).toEqual(["files"])
    expect(filterReferenceCategories("pull_requests").map((category) => category.kind)).toEqual(["pull_requests"])
    expect(filterReferenceCategories("nonexistent")).toEqual([])
  })

  test("wraps keyboard navigation and handles empty lists", () => {
    expect(moveMentionIndex(0, -1, 6)).toBe(5)
    expect(moveMentionIndex(5, 1, 6)).toBe(0)
    expect(moveMentionIndex(8, 1, 2)).toBe(0)
    expect(moveMentionIndex(0, 1, 0)).toBe(0)
  })
})

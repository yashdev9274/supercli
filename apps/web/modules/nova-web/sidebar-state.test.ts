import { describe, expect, test } from "bun:test"

import { hasSidebarFilters, isThreadUnread, markThreadsRead, organizeSidebar, parseSidebarPreferences, removeSidebarFolder, reorderIds } from "./sidebar-state"
import type { AgentSessionSummary } from "./types"

function session(id: string, extra: Partial<AgentSessionSummary> = {}): AgentSessionSummary {
  return { contractVersion: "1", id, objective: `Thread ${id}`, mode: "agent", status: "active", activeRunId: null, latestSequence: 3, surfaces: [], updatedAt: "2026-10-29T00:00:00Z", createdAt: "2026-10-28T00:00:00Z", ...extra }
}
const defaults = () => parseSidebarPreferences(null)
const ids = (sessions: AgentSessionSummary[], preferences = defaults(), query = "") => organizeSidebar(sessions, query, preferences).flatMap((group) => group.sessions.map((item) => item.id))

describe("sidebar preferences", () => {
  test("validates stored data and falls back for corrupt or incompatible values", () => {
    expect(parseSidebarPreferences("not json")).toEqual(defaults())
    expect(parseSidebarPreferences('{"version":2}')).toEqual(defaults())
    expect(parseSidebarPreferences('{"folders":[{"id":"x","name":""}]}')).toEqual(defaults())
    expect(parseSidebarPreferences('{"sort":"createdAt","detailed":false}').sort).toBe("createdAt")
    expect(parseSidebarPreferences('{"detailed":false}').detailed).toBe(false)
  })
  test("sorts by real creation/update dates without mutating source", () => {
    const sessions = [session("a", { updatedAt: "2026-10-30T00:00:00Z" }), session("b", { createdAt: "2026-10-29T00:00:00Z" })]
    expect(ids(sessions)).toEqual(["a", "b"])
    expect(ids(sessions, { ...defaults(), sort: "createdAt" })).toEqual(["b", "a"])
    expect(sessions.map((item) => item.id)).toEqual(["a", "b"])
  })
  test("combines query, project, creator, participant and origin filters", () => {
    const sessions = [session("a", { project: { id: "p", name: "Project" }, creator: { id: "owner", name: "Owner" }, participants: [{ id: "member", name: "Member" }], origin: "automation" }), session("b")]
    const preferences = { ...defaults(), filters: { project: "p", creator: "owner", participant: "member", origin: "automation" as const } }
    expect(hasSidebarFilters(preferences)).toBe(true)
    expect(ids(sessions, preferences, "THREAD A")).toEqual(["a"])
    expect(ids(sessions, preferences, "b")).toEqual([])
    expect(ids(sessions, { ...defaults(), filters: { ...defaults().filters, project: "none" } })).toEqual(["b"])
  })
  test("creator is also a participant and origins fall back to surfaces", () => {
    const sessions = [session("a", { creator: { id: "u", name: "User" } })]
    expect(ids(sessions, { ...defaults(), filters: { ...defaults().filters, participant: "u" } })).toEqual(["a"])
  })
  test("groups by project or none and applies latest activity caption order", () => {
    const sessions = [session("a", { project: { id: "z", name: "Zebra" }, updatedAt: "2026-10-30T00:00:00Z" }), session("b", { project: { id: "a", name: "Alpha" } })]
    expect(organizeSidebar(sessions, "", defaults()).map((group) => group.name)).toEqual(["Alpha", "Zebra"])
    expect(organizeSidebar(sessions, "", { ...defaults(), captionOrder: "activity" }).map((group) => group.name)).toEqual(["Zebra", "Alpha"])
    expect(organizeSidebar(sessions, "", { ...defaults(), group: "none" })).toHaveLength(1)
  })
  test("folders retain one copy of each thread and removing them never deletes threads", () => {
    const sessions = [session("a"), session("b")]
    const preferences = { ...defaults(), folders: [{ id: "f", name: "Work" }, { id: "empty", name: "Empty" }], assignments: { a: "f" }, collapsed: ["folder:f"], groupOrder: ["folder:f"] }
    const groups = organizeSidebar(sessions, "", preferences)
    expect(groups.find((group) => group.id === "folder:f")?.sessions.map((item) => item.id)).toEqual(["a"])
    expect(ids(sessions, preferences).sort()).toEqual(["a", "b"])
    const removed = removeSidebarFolder(preferences, "f")
    expect(removed.assignments).toEqual({})
    expect(removed.collapsed).toEqual([])
    expect(ids(sessions, removed).sort()).toEqual(["a", "b"])
    expect(organizeSidebar(sessions, "missing", preferences)).toEqual([])
  })
  test("unknown folder assignments fall back to normal groups", () => {
    expect(ids([session("a")], { ...defaults(), assignments: { a: "missing" } })).toEqual(["a"])
  })
  test("manual reorder works in both directions and preserves new threads", () => {
    expect(reorderIds(["a", "b", "c"], "a", "c")).toEqual(["b", "c", "a"])
    expect(reorderIds(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"])
    expect(reorderIds(["a"], "missing", "a")).toEqual(["a"])
    expect(ids([session("a"), session("b"), session("c")], { ...defaults(), threadOrder: ["b", "a"] })).toEqual(["b", "a", "c"])
  })
  test("mark all read tracks sequence and later activity becomes unread", () => {
    const thread = session("a")
    expect(isThreadUnread(thread, defaults())).toBe(true)
    const preferences = markThreadsRead(defaults(), [thread])
    expect(isThreadUnread(thread, preferences)).toBe(false)
    expect(isThreadUnread({ ...thread, latestSequence: 4 }, preferences)).toBe(true)
    expect(markThreadsRead(preferences, [{ ...thread, latestSequence: 1 }]).read.a).toBe(3)
  })
})

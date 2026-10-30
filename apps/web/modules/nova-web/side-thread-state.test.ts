import { describe, expect, test } from "bun:test"

import { closeSideThreadTab, mergeSideThreadTabs, saveSideThreadTab, type SideThreadTab } from "./side-thread-state"

const draft: SideThreadTab = { key: "draft-1", sessionId: null, title: "New side thread", closed: false }

describe("side-thread controller identity", () => {
  test("saving a draft keeps its mounted controller key", () => {
    expect(saveSideThreadTab([draft], draft.key, { id: "session-1", objective: "Explore" })).toEqual([
      { ...draft, sessionId: "session-1", title: "Explore" },
    ])
    expect(draft.sessionId).toBeNull()
  })

  test("polling preserves drafts, closed state and stable keys", () => {
    const saved = { key: "draft-2", sessionId: "session-2", title: "Old", closed: true }
    const result = mergeSideThreadTabs([draft, saved], [
      { id: "session-2", objective: "Updated" },
      { id: "session-3", objective: "Another" },
    ])
    expect(result).toEqual([draft, { ...saved, title: "Updated" }, { key: "session-3", sessionId: "session-3", title: "Another", closed: false }])
    expect(mergeSideThreadTabs(result, [{ id: "session-3", objective: "Another" }])).toHaveLength(3)
  })

  test("closing retains a controller even for an unsaved draft", () => {
    expect(closeSideThreadTab([draft], draft.key)).toEqual([{ ...draft, closed: true }])
    expect(draft.closed).toBe(false)
  })

  test("creation racing with polling cannot duplicate the saved session", () => {
    const polled = mergeSideThreadTabs([draft], [{ id: "session-1", objective: "Explore" }])
    expect(saveSideThreadTab(polled, draft.key, { id: "session-1", objective: "Explore" })).toEqual([
      { ...draft, sessionId: "session-1", title: "Explore" },
    ])
  })
})

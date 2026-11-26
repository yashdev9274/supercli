import { describe, expect, it, beforeEach } from "bun:test"

import {
  joinIslandLink,
  openIslandLink,
  postIslandTurn,
  readIslandLink,
  resetIslandLinks,
  touchIslandLink,
} from "../islandLink"

beforeEach(() => resetIslandLinks())

describe("island voice link", () => {
  it("lets the island join with the code and share turns both ways", () => {
    const opened = openIslandLink("user-1")
    expect(opened.status).toBe("waiting")
    expect(opened.code).toMatch(/^[A-Z2-9]{6}$/)

    expect(joinIslandLink("user-2", opened.code!)).toBeNull()
    const joined = joinIslandLink("user-1", opened.code!.toLowerCase())
    expect(joined?.linkId).toBe(opened.id)
    expect(joined?.status).toBe("live")

    expect(postIslandTurn("user-1", opened.id, "user", "open the approvals queue").ok).toBe(true)
    const nova = readIslandLink("user-1", opened.id, 0)
    expect(nova?.turns.map((turn) => turn.content)).toEqual(["open the approvals queue"])

    expect(postIslandTurn("user-1", opened.id, "assistant", "Two approvals are waiting.").ok).toBe(true)
    const island = touchIslandLink("user-1", opened.id, nova!.cursor)
    expect(island?.turns.map((turn) => turn.content)).toEqual(["Two approvals are waiting."])
    expect(island?.cursor).toBe(2)
  })

  it("rejects a second join and hides the code from the island view", () => {
    const opened = openIslandLink("user-1")
    joinIslandLink("user-1", opened.code!)
    expect(joinIslandLink("user-1", opened.code!)).toBeNull()

    const island = touchIslandLink("user-1", opened.id)
    expect(island?.code).toBeUndefined()
    expect(island?.status).toBe("live")
  })

  it("refuses turns until the island has joined", () => {
    const opened = openIslandLink("user-1")
    expect(postIslandTurn("user-1", opened.id, "user", "hello")).toEqual({ ok: false, reason: "not-live" })
  })
})

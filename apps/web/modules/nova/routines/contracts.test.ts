import { describe, expect, test } from "bun:test"
import { routineSlot } from "./contracts"

describe("routineSlot", () => {
  test("matches a daily routine in its configured timezone", () => {
    const slot = routineSlot(
      { scheduleType: "daily", dayOfWeek: null, hour: 9, minute: 0, timezone: "Asia/Calcutta" },
      new Date("2026-11-13T03:30:00.000Z"),
    )

    expect(slot).toBe("2026-11-13:09:00:Asia/Calcutta")
  })

  test("does not match a routine outside its scheduled minute", () => {
    const slot = routineSlot(
      { scheduleType: "daily", dayOfWeek: null, hour: 9, minute: 0, timezone: "Asia/Calcutta" },
      new Date("2026-11-13T03:31:00.000Z"),
    )

    expect(slot).toBeNull()
  })

  test("matches weekly routines using the local weekday", () => {
    const slot = routineSlot(
      { scheduleType: "weekly", dayOfWeek: 5, hour: 9, minute: 0, timezone: "Asia/Calcutta" },
      new Date("2026-11-13T03:30:00.000Z"),
    )

    expect(slot).toBe("2026-11-13:09:00:Asia/Calcutta")
  })
})

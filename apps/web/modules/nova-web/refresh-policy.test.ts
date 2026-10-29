import { describe, expect, test } from "bun:test"

import { createRefreshGate, startVisiblePolling } from "./refresh-policy"

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

function pollingEnvironment() {
  let visible = true
  let listener = () => {}
  let next = 0
  const timers = new Map<number, { callback: () => void; delay: number }>()
  return {
    timers,
    notify(value: boolean) { visible = value; listener() },
    fire() {
      const entry = timers.entries().next().value
      if (!entry) throw new Error("No scheduled timer")
      timers.delete(entry[0])
      entry[1].callback()
    },
    env: {
      visible: () => visible,
      schedule(callback: () => void, delay: number) {
        const id = ++next
        timers.set(id, { callback, delay })
        return id as unknown as ReturnType<typeof setTimeout>
      },
      cancel(timer: ReturnType<typeof setTimeout>) { timers.delete(timer as unknown as number) },
      subscribe(callback: () => void) {
        listener = callback
        return () => { listener = () => {} }
      },
    },
  }
}

describe("Nova refresh gate", () => {
  test("deduplicates in-flight reads and respects per-key freshness", async () => {
    let now = 0
    const refresh = createRefreshGate(() => now)
    let calls = 0
    let finish = () => {}
    const task = async () => { calls++; await new Promise<void>((resolve) => { finish = resolve }) }
    const first = refresh("user:sessions", task, 60_000)
    expect(refresh("user:sessions", task, 60_000)).toBe(first)
    await flush()
    expect(calls).toBe(1)
    finish()
    await first
    await refresh("user:sessions", task, 60_000)
    expect(calls).toBe(1)
    now = 60_000
    const second = refresh("user:sessions", task, 60_000)
    await flush()
    expect(calls).toBe(2)
    finish()
    await second
    await refresh("other-user:sessions", async () => { calls++ }, 60_000)
    expect(calls).toBe(3)
  })

  test("forced mutation refresh waits for old read then gets a new snapshot", async () => {
    const refresh = createRefreshGate()
    let finish = () => {}
    const events: string[] = []
    const old = refresh("sessions", async () => {
      events.push("old")
      await new Promise<void>((resolve) => { finish = resolve })
    })
    await flush()
    const forced = refresh("sessions", async () => { events.push("new") }, 60_000, true)
    expect(events).toEqual(["old"])
    finish()
    await Promise.all([old, forced])
    expect(events).toEqual(["old", "new"])
  })

  test("failed requests do not become fresh", async () => {
    const refresh = createRefreshGate()
    await expect(refresh("approvals", async () => { throw new Error("offline") }, 60_000)).rejects.toThrow("offline")
    let retried = false
    await refresh("approvals", async () => { retried = true }, 60_000)
    expect(retried).toBe(true)
  })
})

describe("visible polling", () => {
  test("pauses hidden tabs, resumes once and cleans up", async () => {
    const browser = pollingEnvironment()
    browser.notify(false)
    let calls = 0
    const stop = startVisiblePolling(async () => { calls++ }, 60_000, browser.env, true)
    expect(calls).toBe(0)
    expect(browser.timers.size).toBe(0)
    browser.notify(true)
    browser.notify(true)
    await flush()
    expect(calls).toBe(1)
    expect([...browser.timers.values()][0].delay).toBe(60_000)
    browser.notify(false)
    expect(browser.timers.size).toBe(0)
    stop()
    browser.notify(true)
    expect(calls).toBe(1)
  })

  test("slow requests never overlap and stopped requests do not reschedule", async () => {
    const browser = pollingEnvironment()
    let calls = 0
    let finish = () => {}
    const stop = startVisiblePolling(async () => {
      calls++
      await new Promise<void>((resolve) => { finish = resolve })
    }, 8_000, browser.env, true)
    browser.notify(true)
    expect(calls).toBe(1)
    expect(browser.timers.size).toBe(0)
    finish()
    await flush()
    expect(browser.timers.size).toBe(1)
    browser.fire()
    expect(calls).toBe(2)
    expect(browser.timers.size).toBe(0)
    stop()
    finish()
    await flush()
    expect(browser.timers.size).toBe(0)
  })

  test("failed polls retry after the configured interval", async () => {
    const browser = pollingEnvironment()
    let calls = 0
    const stop = startVisiblePolling(async () => { calls++; throw new Error("offline") }, 60_000, browser.env, true)
    await flush()
    browser.fire()
    await flush()
    expect(calls).toBe(2)
    stop()
  })
})

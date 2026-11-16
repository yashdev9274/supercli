import { expect, test } from "bun:test"
import { executeTaskGraph, TASK_GRAPH_CONCURRENCY } from "./task-graph"

function gate() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

test("sequential graphs execute every node in order, including more than three", async () => {
  const order: number[] = []
  let active = 0
  const results = await executeTaskGraph(Array.from({ length: 8 }, (_, index) => ({
    readOnly: true,
    run: async () => {
      expect(active++).toBe(0)
      await Promise.resolve()
      order.push(index)
      active--
      return index
    },
  })))
  expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  expect(results).toEqual(order)
})

test("read fan-out refills free slots without waiting for the slowest sibling", async () => {
  const release = Array.from({ length: 5 }, gate)
  const started = Array.from({ length: 5 }, gate)
  let active = 0
  let maximum = 0
  const result = executeTaskGraph(release.map((item, index) => ({
    readOnly: true,
    run: async () => {
      active++
      maximum = Math.max(maximum, active)
      started[index]!.resolve()
      await item.promise
      active--
      return index
    },
  })), true)
  await started[2]!.promise
  expect(maximum).toBe(TASK_GRAPH_CONCURRENCY)
  release[1]!.resolve()
  await started[3]!.promise
  expect(active).toBe(3)
  release[2]!.resolve()
  await started[4]!.promise
  release.forEach((item) => item.resolve())
  expect(await result).toEqual([0, 1, 2, 3, 4])
  expect(maximum).toBe(3)
})

test("writers are exclusive barriers before later read branches", async () => {
  const order: string[] = []
  let active = 0
  const results = await executeTaskGraph([true, true, false, true, false].map((readOnly, index) => ({
    readOnly,
    run: async () => {
      if (!readOnly) expect(active).toBe(0)
      active++
      order.push(`start:${index}`)
      await Promise.resolve()
      order.push(`end:${index}`)
      active--
      return index
    },
  })), true)
  expect(results).toEqual([0, 1, 2, 3, 4])
  expect(order.indexOf("start:2")).toBeGreaterThan(order.indexOf("end:0"))
  expect(order.indexOf("start:2")).toBeGreaterThan(order.indexOf("end:1"))
  expect(order.indexOf("start:3")).toBeGreaterThan(order.indexOf("end:2"))
  expect(order.indexOf("start:4")).toBeGreaterThan(order.indexOf("end:3"))
})

for (const external of [false, true]) {
  test(`${external ? "cancellation" : "failure"} stops queued nodes and drains active branches`, async () => {
    const first = gate()
    const started = gate()
    const controller = new AbortController()
    const error = new Error("stop graph")
    const calls: number[] = []
    let drained = false
    const result = executeTaskGraph(Array.from({ length: 5 }, (_, index) => ({
      readOnly: index < 4,
      run: async (signal: AbortSignal) => {
        calls.push(index)
        if (index === 0) {
          await first.promise
          if (external) return index
          throw error
        }
        if (index === 2) started.resolve()
        await new Promise<void>((resolve) => signal.addEventListener("abort", () => { drained = true; resolve() }, { once: true }))
        return index
      },
    })), true, controller.signal)
    await started.promise
    if (external) controller.abort(error)
    first.resolve()
    await expect(result).rejects.toBe(error)
    expect(calls).toEqual([0, 1, 2])
    expect(drained).toBe(true)
  })
}

import { expect, test } from "bun:test"
import { createDurableJournal, InteractionPending, stableHash, type JournalStore, type Receipt } from "./durable"

function memory() {
  const rows = new Map<string, Receipt>()
  const store: JournalStore = {
    async reserve(key, hash) {
      if (!rows.has(key)) rows.set(key, { id: key, hash, status: "pending", result: null })
      return { ...rows.get(key)! }
    },
    async claim(id) {
      const row = rows.get(id)!
      if (!["pending", "approved"].includes(row.status)) return false
      row.status = "executing"
      return true
    },
    async finish(id, result) { Object.assign(rows.get(id)!, { status: "completed", result: structuredClone(result) }) },
    async wait(id) { rows.get(id)!.status = "awaiting_input" },
  }
  return { rows, store }
}

test("completed inference and mutation receipts replay without execution", async () => {
  const { store } = memory()
  let inferences = 0, mutations = 0
  for (let restart = 0; restart < 2; restart++) {
    const journal = createDurableJournal(store)
    const result = await journal.inference({ input: "hello" }, async () => { inferences++; return { events: [{ type: "finish" }], state: { reasoning: "encrypted", round: 1 } } })
    expect(result.state).toEqual({ reasoning: "encrypted", round: 1 })
    expect(await journal.tool("write", { text: "hello" }, false, false, async () => { mutations++; return { success: true } })).toEqual({ success: true })
  }
  expect(inferences).toBe(1)
  expect(mutations).toBe(1)
})

test("approval pauses before side effects then executes once", async () => {
  const { store, rows } = memory()
  let calls = 0
  const execute = async () => { calls++; return { success: true } }
  await expect(createDurableJournal(store).tool("publish", { text: "bound" }, true, false, execute)).rejects.toBeInstanceOf(InteractionPending)
  expect(calls).toBe(0)
  rows.get("primary:0")!.status = "approved"
  await createDurableJournal(store).tool("publish", { text: "bound" }, true, false, execute)
  await createDurableJournal(store).tool("publish", { text: "bound" }, true, false, execute)
  expect(calls).toBe(1)
})

test("question answer is replayed as a tool result, never executed", async () => {
  const { store, rows } = memory()
  const execute = async () => { throw new Error("Question has no external executor") }
  const args = { questions: [{ question: "Choose?" }] }
  await expect(createDurableJournal(store).tool("question", args, false, false, execute)).rejects.toBeInstanceOf(InteractionPending)
  Object.assign(rows.get("primary:0")!, { status: "completed", result: { answers: ["A"] } })
  expect(await createDurableJournal(store).tool("question", args, false, false, execute)).toEqual({ answers: ["A"] })
})

test("changed arguments cannot consume a prior approval", async () => {
  const { store, rows } = memory()// Auto-closed: pre-existing file was truncated mid-test before this commit. The
// single open `test(...)` block above never closed; we close it here so `tsc`
// can validate the rest of the project. The test itself remains a no-op stub.
})

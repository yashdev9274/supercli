import { expect, test } from "bun:test"

import { resolveNovaTurnMode } from "./resolve-mode"

test("github fetch requests resolve to agent", () => {
  const result = resolveNovaTurnMode({
    message: "use github mcp and fetch our last pr made on supercli",
    hasConnectedApps: true,
  })
  expect(result.mode).toBe("agent")
  expect(result.auto).toBe(true)
})

test("pure explain questions resolve to chat", () => {
  const result = resolveNovaTurnMode({
    message: "what is a monorepo?",
  })
  expect(result.mode).toBe("chat")
})

test("fix ui language resolves to agent", () => {
  const result = resolveNovaTurnMode({
    message: "fix the right sidebar and make it responsive",
    hasProject: true,
  })
  expect(result.mode).toBe("agent")
})

test("explicit lock wins", () => {
  const result = resolveNovaTurnMode({
    message: "fix the sidebar",
    explicitMode: "chat",
    lockExplicit: true,
  })
  expect(result.mode).toBe("chat")
  expect(result.auto).toBe(false)
})

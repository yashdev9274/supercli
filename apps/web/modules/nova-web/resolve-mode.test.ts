import { expect, test } from "bun:test"

import { resolveNovaTurnMode } from "./resolve-mode"

test("github fetch requests remain read-only in chat", () => {
  const result = resolveNovaTurnMode({
    message: "use github mcp and fetch our last pr made on supercli",
    hasConnectedApps: true,
  })
  expect(result.mode).toBe("chat")
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

for (const message of [
  "Create a new landing page",
  "Update the config file",
  "Delete the unused component",
  "Rename helpers.ts to utils.ts",
  "Can you create a new API endpoint?",
  "Plan the changes and then implement them",
  "Generate a package.json for this app",
  "There is a bug in the sidebar; fix it",
]) {
  test(`implementation selects Agent: ${message}`, () => {
    expect(resolveNovaTurnMode({ message, explicitMode: "chat" }).mode).toBe("agent")
  })
}

for (const message of [
  "Explain how to create a file",
  "How do I delete a branch?",
  "What is the update command?",
  "Review the attached files",
  "Summarize this repository",
  "Fetch the latest GitHub PR",
]) {
  test(`read-only request selects Chat even with files: ${message}`, () => {
    expect(resolveNovaTurnMode({ message, hasAttachments: true, hasProject: true, explicitMode: "agent" }).mode).toBe("chat")
  })
}

for (const message of [
  "Plan how to create a new app",
  "Design an approach to delete unused files",
  "Create a plan for updating the API",
  "Fix the sidebar, but don't edit files yet",
  "Plan only: implement a dashboard",
]) {
  test(`planning restriction selects Plan: ${message}`, () => {
    expect(resolveNovaTurnMode({ message, hasAttachments: true }).mode).toBe("plan")
  })
}

test("quoted mutation commands cannot enable Agent mode", () => {
  expect(resolveNovaTurnMode({ message: "Explain this script:\n```sh\nrm old.ts # delete file\n```", hasAttachments: true }).mode).toBe("chat")
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

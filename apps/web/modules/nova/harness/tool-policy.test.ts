import { expect, test } from "bun:test"

import { canExecuteTool, classifyComposioTool, toolsAllowedForMode } from "./tool-policy"

test("classifies GitHub list/get as read", () => {
  expect(classifyComposioTool("GITHUB_LIST_PULL_REQUESTS")).toBe("read")
  expect(classifyComposioTool("GITHUB_GET_A_PULL_REQUEST")).toBe("read")
  expect(classifyComposioTool("GITHUB_LIST_PULL_REQUEST_FILES")).toBe("read")
  expect(classifyComposioTool("check_if_pull_request_merged")).toBe("read")
})

test("classifies mutations as write", () => {
  expect(classifyComposioTool("GITHUB_CREATE_AN_ISSUE_COMMENT")).toBe("write")
  expect(classifyComposioTool("LINEAR_UPDATE_ISSUE")).toBe("write")
})

test("chat mode only gets reads; agent gets writes too", () => {
  const tools = [
    { name: "GITHUB_LIST_PULL_REQUESTS", requiresApproval: false },
    { name: "GITHUB_CREATE_AN_ISSUE_COMMENT", requiresApproval: true },
  ]
  expect(toolsAllowedForMode("chat", tools).map((t) => t.name)).toEqual(["GITHUB_LIST_PULL_REQUESTS"])
  expect(toolsAllowedForMode("agent", tools).map((t) => t.name).sort()).toEqual([
    "GITHUB_CREATE_AN_ISSUE_COMMENT",
    "GITHUB_LIST_PULL_REQUESTS",
  ])
  expect(canExecuteTool("chat", "GITHUB_CREATE_AN_ISSUE_COMMENT", true)).toBe(false)
  expect(canExecuteTool("agent", "GITHUB_CREATE_AN_ISSUE_COMMENT", true)).toBe(true)
})

import { beforeEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

let userId: string | null = "u"
let project: { repositoryFullName: string | null } | null = { repositoryFullName: "fork/repo" }
let failure = false
let calls: unknown[] = []
mock.module("@super/auth/server", () => ({ auth: { api: { getSession: async () => userId ? { user: { id: userId } } : null } } }))
mock.module("next/headers", () => ({ headers: async () => new Headers() }))
mock.module("@/modules/nova/local-projects/service", () => ({ getLocalProject: async (...args: unknown[]) => { calls.push(args); return project } }))
mock.module("@/modules/nova/local-projects/github", () => ({ listGithubBranches: async (...args: unknown[]) => {
  calls.push(args)
  if (failure) throw new Error("provider credential detail must not escape")
  return { branches: [{ name: "trunk", sha: "a".repeat(40), isDefault: true }], defaultBranch: "trunk", truncated: false }
} }))
const { GET } = await import("./route")
const get = () => GET(new NextRequest("http://localhost/api/nova/local-projects/p/branches"), { params: Promise.resolve({ projectId: "p" }) })
beforeEach(() => { userId = "u"; project = { repositoryFullName: "fork/repo" }; failure = false; calls = [] })

test("connected branch discovery authorizes the project without a companion device", async () => {
  const response = await get()
  expect(response.status).toBe(200)
  expect((await response.json()).defaultBranch).toBe("trunk")
  expect(calls).toEqual([["u", "p"], ["u", "fork/repo"]])
})

test("unauthenticated and inaccessible projects never enumerate branches", async () => {
  userId = null
  expect((await get()).status).toBe(401)
  expect(calls).toHaveLength(0)
  userId = "u"
  project = null
  expect((await get()).status).toBe(404)
  expect(calls).toEqual([["u", "p"]])
})

test("non-GitHub projects and provider errors return safe failures", async () => {
  project = { repositoryFullName: null }
  expect((await get()).status).toBe(400)
  project = { repositoryFullName: "fork/repo" }
  failure = true
  const response = await get()
  expect(response.status).toBe(502)
  expect(await response.text()).not.toContain("credential detail")
})

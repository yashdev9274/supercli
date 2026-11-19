import { beforeEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"
import { z } from "zod"

let userId: string | null = "u"
let available = true
let failure = false
let calls: unknown[] = []
mock.module("@super/auth/server", () => ({ auth: { api: { getSession: async () => userId ? { user: { id: userId } } : null } } }))
mock.module("next/headers", () => ({ headers: async () => new Headers() }))
mock.module("@/modules/nova/local-projects/github", () => ({
  githubSourceFilePathSchema: z.string().min(1),
  readSessionGithubSourceFile: async (...args: unknown[]) => {
    calls.push(args)
    if (failure) throw new Error("provider credential detail")
    if (!available) return null
    return args[2] === undefined ? { paths: ["src/file.ts"], truncated: false } : { path: args[2], text: "pinned" }
  },
}))
const { GET } = await import("./route")
const get = (query = "") => GET(new NextRequest(`http://localhost/api/nova/sessions/s/source-file${query}`), { params: Promise.resolve({ sessionId: "s" }) })
beforeEach(() => { userId = "u"; available = true; failure = false; calls = [] })

test("source-file endpoint returns a pinned index without path and text with path", async () => {
  const index = await get()
  expect(await index.json()).toEqual({ paths: ["src/file.ts"], truncated: false })
  const file = await get("?path=src%2Ffile.ts")
  expect(await file.json()).toEqual({ path: "src/file.ts", text: "pinned" })
  expect(file.headers.get("Cache-Control")).toBe("private, no-store")
  expect(calls).toEqual([["u", "s", undefined], ["u", "s", "src/file.ts"]])
})

test("unauthenticated and unavailable sources fail closed", async () => {
  userId = null
  expect((await get()).status).toBe(401)
  expect(calls).toHaveLength(0)
  userId = "u"
  available = false
  expect((await get()).status).toBe(404)
  expect((await get("?path=")).status).toBe(400)
})

test("provider error details never escape the endpoint", async () => {
  failure = true
  const response = await get("?path=src/file.ts")
  expect(response.status).toBe(502)
  expect(await response.text()).not.toContain("credential detail")
})

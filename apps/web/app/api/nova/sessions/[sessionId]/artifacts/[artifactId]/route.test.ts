import { beforeEach, expect, mock, test } from "bun:test"

let userId: string | null = "u"
let membership = "active"
let owner = "u"
let organizationId = "o"
let expiresAt = new Date(Date.now() + 60_000).toISOString()
let patch = "diff --git a/a b/a\n"
mock.module("@super/auth/server", () => ({ auth: { api: { getSession: async () => userId ? { user: { id: userId } } : null } } }))
mock.module("next/headers", () => ({ headers: async () => new Headers() }))
mock.module("@super/db", () => ({ default: {
  novaArtifact: { findFirst: async () => ({ metadata: { userId: owner, organizationId, expiresAt, patch }, agentSession: { organizationId: "o" } }) },
  organizationMembership: { findUnique: async () => ({ status: membership }) },
} }))
const { GET } = await import("./route")
const download = () => GET(new Request("https://example.test"), { params: Promise.resolve({ sessionId: "s", artifactId: "a" }) })
beforeEach(() => {
  userId = "u"
  membership = "active"
  owner = "u"
  organizationId = "o"
  expiresAt = new Date(Date.now() + 60_000).toISOString()
  patch = "diff --git a/a b/a\n"
})
test("download requires authentication and owner membership", async () => {
  userId = null
  expect((await download()).status).toBe(401)
  userId = "another-user"
  expect((await download()).status).toBe(404)
  userId = "u"
  membership = "inactive"
  expect((await download()).status).toBe(404)
})
test("cross-organization, expired and oversized artifacts are rejected", async () => {
  organizationId = "another-org"
  expect((await download()).status).toBe(404)
  organizationId = "o"
  expiresAt = new Date(0).toISOString()
  expect((await download()).status).toBe(410)
  expiresAt = new Date(Date.now() + 60_000).toISOString()
  patch = "x".repeat(1_000_001)
  expect((await download()).status).toBe(422)
})
test("valid patch is a private non-cacheable attachment", async () => {
  const response = await download()
  expect(response.status).toBe(200)
  expect(response.headers.get("cache-control")).toBe("private, no-store")
  expect(response.headers.get("content-disposition")).toContain("attachment")
  expect(response.headers.get("x-content-type-options")).toBe("nosniff")
  expect(await response.text()).toBe(patch)
})

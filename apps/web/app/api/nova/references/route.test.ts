import { beforeEach, expect, mock, test } from "bun:test"
import { NextRequest } from "next/server"

let signedIn = true
let failure: Error | null = null
class ScopeError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}
const search = mock(async (_userId: string, _kind: string, _query: string) => {
  if (failure) throw failure
  return { items: [{ kind: _kind, id: "fixture_ref", label: _query || "Fixture reference", description: _userId }] }
})
mock.module("@super/auth/server", () => ({ auth: { api: { getSession: async () => signedIn ? { user: { id: "authenticated_user" } } : null } } }))
mock.module("@/modules/nova/references/service", () => ({ ReferenceServiceError: ScopeError, searchNovaReferences: search }))
const { GET } = await import("./route")

beforeEach(() => { signedIn = true; failure = null; search.mockClear() })

test("reference search requires a signed-in session", async () => {
  signedIn = false
  expect((await GET(new NextRequest("http://nova.localhost:3003/api/nova/references?kind=files"))).status).toBe(401)
  expect(search).not.toHaveBeenCalled()
})

test("uses the session actor, not a user ID supplied in the URL", async () => {
  const response = await GET(new NextRequest("http://nova.localhost:3003/api/nova/references?kind=threads&q=%20release%20&userId=another_user"))
  expect(response.status).toBe(200)
  expect(search).toHaveBeenCalledWith("authenticated_user", "threads", "release")
  expect(response.headers.get("cache-control")).toBe("no-store")
})

test("rejects unsupported kinds and oversized queries", async () => {
  expect((await GET(new NextRequest("http://nova.localhost:3003/api/nova/references?kind=credentials"))).status).toBe(400)
  expect((await GET(new NextRequest(`http://nova.localhost:3003/api/nova/references?kind=files&q=${"x".repeat(201)}`))).status).toBe(400)
  expect(search).not.toHaveBeenCalled()
})

test("reports access failures but does not expose internal provider errors", async () => {
  failure = new ScopeError("Active membership required", 403)
  const denied = await GET(new NextRequest("http://nova.localhost:3003/api/nova/references?kind=threads"))
  expect(denied.status).toBe(403)
  expect((await denied.json()).error).toBe("Active membership required")
  failure = new Error("internal-provider-detail")
  const failed = await GET(new NextRequest("http://nova.localhost:3003/api/nova/references?kind=files"))
  expect(failed.status).toBe(502)
  expect(await failed.text()).not.toContain("internal-provider-detail")
})

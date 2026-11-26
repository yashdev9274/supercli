import { afterAll, expect, mock, test } from "bun:test"

let identityStatus = 200
let lookups = 0
let calls = 0
mock.module("@super/auth/server", () => ({ auth: { api: { getSession: async () => null } } }))
mock.module("@super/db", () => ({ default: { user: { findFirst: async ({ where }: { where: { email: { equals: string } } }) => {
  lookups++
  expect(where.email.equals).toBe("verified@example.test")
  return { id: "verified-user", email: "verified@example.test", name: "Voice", image: null }
} } } }))

const originalFetch = globalThis.fetch
globalThis.fetch = (async (input, init) => {
  calls++
  expect(new URL(String(input)).pathname).toBe("/api/voice/identity")
  expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer synthetic-device-session")
  return Response.json({ email: "verified@example.test" }, { status: identityStatus })
}) as typeof fetch
afterAll(() => { globalThis.fetch = originalFetch })

const { resolveVoiceCaller } = await import("./auth")

test("voice resolves the verified CLI identity, never a caller-supplied user id", async () => {
  const caller = await resolveVoiceCaller(new Request("https://nova.example/api/nova/voice/models?userId=other-user", { headers: { Authorization: "Bearer synthetic-device-session" } }))
  expect(caller?.id).toBe("verified-user")
  expect(caller?.harnessToken).toBe("synthetic-device-session")
  expect(caller?.sessionId).toMatch(/^voice:[a-f0-9]{64}$/)
  expect(caller?.sessionId).not.toContain("synthetic-device-session")
})

test("an expired device session cannot access a Nova connection", async () => {
  identityStatus = 401
  const previousLookups = lookups
  expect(await resolveVoiceCaller(new Request("https://nova.example/api/nova/voice/models", { headers: { Authorization: "Bearer synthetic-device-session" } }))).toBeNull()
  expect(lookups).toBe(previousLookups)
})

test("missing bearer authorization fails before any identity or database lookup", async () => {
  const previousCalls = calls
  expect(await resolveVoiceCaller(new Request("https://nova.example/api/nova/voice/models"))).toBeNull()
  expect(calls).toBe(previousCalls)
})

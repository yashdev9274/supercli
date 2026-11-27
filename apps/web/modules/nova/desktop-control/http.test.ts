import { beforeEach, expect, mock, test } from "bun:test"

let userId: string | undefined
let calls: unknown[][] = []
mock.module("@super/auth/server", () => ({ auth: { api: { getSession: async () => userId ? { user: { id: userId } } : null } } }))
const { handleDesktopControl, desktopControlUnavailable } = await import("./http")
const service: NonNullable<Parameters<typeof handleDesktopControl>[2]> = {
  issueEnrollment: async (...args) => { calls.push(args); return { code: "code", expiresAt: new Date() } },
  enrollDevice: async (...args) => { calls.push(args); return { id: "device" } },
  enqueueCommand: async (...args) => { calls.push(args); throw new Error("not expected") },
  listDevices: async (...args: unknown[]) => { calls.push(args); return [] },
  revokeDevice: async (...args: unknown[]) => { calls.push(args); throw new Error("private database detail") },
  pollDevice: async (...args: unknown[]) => { calls.push(args); throw new Error("bad signature") },
  deviceOperation: async (...args: unknown[]) => { calls.push(args); return { ok: true } },
}

function request(value: unknown, origin = "https://app.example") {
  return new Request("https://app.example/api/nova/desktop-control", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) })
}

beforeEach(() => { userId = undefined; calls = [] })

test("browser auth and origin are checked before service dispatch", async () => {
  expect((await handleDesktopControl(request({ organizationId: "o" }, "https://evil.example"), "enrollment", service)).status).toBe(403)
  expect((await handleDesktopControl(request({ organizationId: "o" }), "enrollment", service)).status).toBe(401)
  expect(calls).toHaveLength(0)
  userId = "trusted-user"
  expect((await handleDesktopControl(request({ organizationId: "o", userId: "attacker" }), "enrollment", service)).status).toBe(400)
  expect(calls).toHaveLength(0)
  expect((await handleDesktopControl(request({ organizationId: "o" }), "enrollment", service)).status).toBe(201)
  expect(calls).toEqual([["trusted-user", "o"]])
})

test("bounded payloads and endpoint-specific signed operations fail closed", async () => {
  userId = "u"
  expect((await handleDesktopControl(request({ organizationId: "x".repeat(70_001) }), "enrollment", service)).status).toBe(400)
  const operation = { deviceId: "d", operation: "start", commandId: "c", fence: null, result: null, timestamp: Date.now(), nonce: "n", signature: "s" }
  expect((await handleDesktopControl(request(operation), "claim", service)).status).toBe(400)
  expect(calls).toHaveLength(0)
})

test("service failures return generic errors without details", async () => {
  userId = "u"
  const response = await handleDesktopControl(request({ organizationId: "o", deviceId: "other" }), "revoke", service)
  expect(response.status).toBe(403)
  expect(await response.text()).not.toContain("database")
})

test("unavailable desktop control returns 503 without caching", async () => {
  const response = desktopControlUnavailable()
  expect(response.status).toBe(503)
  expect(response.headers.get("cache-control")).toBe("no-store")
  expect(await response.json()).toEqual({ error: "Desktop control is not available yet" })
})

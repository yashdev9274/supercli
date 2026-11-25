import { expect, test } from "bun:test"
import type { SessionStreamEvent } from "eve/client"
import { authorizeEveRequest } from "../lib/session-access"

const principal = { principalId: "nova:synthetic-owner", principalType: "user", issuer: "nova" }
const request = (suffix = "/stream", method = "GET") => new Request(`http://localhost/eve/v1/session/wrun_fixture${suffix}`, { method })
const event = (id = principal.principalId, issuer = principal.issuer, line = 0): SessionStreamEvent => ({
  type: "delivery.admitted", data: { deliveryId: "delivery_1", principal: { id, type: "user", issuer } },
  meta: { position: { line, index: 0 }, at: "2026-11-21T00:00:00Z" },
})
const read = (...events: SessionStreamEvent[]) => async function* () { yield* events }

test("existing session reads, messages and controls require the original recorded creator", async () => {
  for (const [suffix, method] of [["/stream", "GET"], ["", "POST"], ["/cancel", "POST"], ["/end", "POST"], ["/compact", "POST"], ["/clear", "POST"]]) {
    expect(await authorizeEveRequest(request(suffix, method), principal, read(event()))).toBe(true)
    expect(await authorizeEveRequest(request(suffix, method), principal, read(event("other")))).toBe(false)
    expect(await authorizeEveRequest(request(suffix, method), principal, read(event(principal.principalId, "other-issuer")))).toBe(false)
  }
})

test("authorization cannot be established by a later caller, empty history, or a reader failure", async () => {
  expect(await authorizeEveRequest(request(), principal, read(event("other"), event()))).toBe(false)
  expect(await authorizeEveRequest(request(), principal, read(event(principal.principalId, principal.issuer, 1)))).toBe(false)
  expect(await authorizeEveRequest(request(), principal, read())).toBe(false)
  expect(await authorizeEveRequest(request(), principal, async function* () { throw new Error("unavailable") })).toBe(false)
})

test("the creation route permits POST only and unrelated routes fail closed", async () => {
  expect(await authorizeEveRequest(new Request("http://localhost/eve/v1/session", { method: "POST" }), principal)).toBe(true)
  expect(await authorizeEveRequest(new Request("http://localhost/eve/v1/session"), principal)).toBe(false)
  expect(await authorizeEveRequest(new Request("http://localhost/eve/v1/info"), principal)).toBe(false)
  expect(await authorizeEveRequest(new Request("http://localhost/eve/v1/session/invalid.id/stream"), principal)).toBe(false)
})

test("ownership probing releases its internal stream as soon as identity is established", async () => {
  let closed = false
  const allowed = await authorizeEveRequest(request(), principal, async function* () {
    try { yield event(); throw new Error("must not scan the conversation") }
    finally { closed = true }
  })
  expect(allowed).toBe(true)
  expect(closed).toBe(true)
})

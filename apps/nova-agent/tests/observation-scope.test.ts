import { expect, test } from "bun:test"
import { authenticateNovaScope, signNovaScope, authorizeNovaScope } from "../lib/scope"
import { codexFixture } from "./codex-fixture"

test("connection revocation blocks inference but does not prevent an owner observing or stopping existing work", async () => {
  const fixture = codexFixture()
  const secret = "synthetic-observation-scope-key-at-least-32-bytes"
  const token = signNovaScope(fixture.scope, { secret })
  const env = { NOVA_EVE_ENABLED: "true", NOVA_EVE_SCOPE_SECRET: secret }
  const revoked = { ...fixture.scopeStore, findConnection: async () => null }
  const request = (path: string, method = "GET") => new Request(`http://localhost/eve/v1/session${path}`, { method, headers: { authorization: `Bearer ${token}` } })
  expect(await authorizeNovaScope(fixture.scope, revoked)).toBe(false)
  expect(await authenticateNovaScope(request("", "POST"), revoked, env)).toBeNull()
  expect(await authenticateNovaScope(request("/remote", "POST"), revoked, env)).toBeNull()
  for (const [path, method] of [["/remote/stream", "GET"], ["/remote/cancel", "POST"], ["/remote/end", "POST"]]) expect(await authenticateNovaScope(request(path, method), revoked, env)).not.toBeNull()
  fixture.state.active = false
  expect(await authenticateNovaScope(request("/remote/stream"), revoked, env)).toBeNull()
  expect(await authenticateNovaScope(request("/remote/cancel", "POST"), revoked, env)).toBeNull()
})

import { expect, test } from "bun:test"
import { createHmac } from "node:crypto"

import {
  authenticateNovaScope,
  authorizeNovaScope,
  NOVA_SCOPE_AUDIENCE,
  NOVA_SCOPE_ISSUER,
  signNovaScope,
  verifyNovaScopeToken,
  type NovaScope,
  type NovaScopeSession,
  type NovaScopeStore,
} from "../lib/scope"
import { createPrismaScopeStore } from "../lib/scope-store"

const secret = "synthetic-scope-test-key-32-bytes-minimum"
const now = 1_800_000_000_000
const options = { secret, now }
const env = { NOVA_EVE_ENABLED: "true", NOVA_EVE_SCOPE_SECRET: secret }
const scope: NovaScope = {
  organizationId: "org_1", userId: "user_1", membershipId: "member_1", novaSessionId: "session_1",
  provider: "codex", connectionId: "connection_1", model: "gpt-5.4-mini", effort: "high",
}
const session = (): NovaScopeSession => ({
  id: scope.novaSessionId,
  organizationId: scope.organizationId,
  initiatorMembership: {
    id: scope.membershipId, organizationId: scope.organizationId, userId: scope.userId, status: "active",
  },
})
const connection = async (selected: NovaScope) => ({ ...selected, status: "connected", enabled: true })
const store: NovaScopeStore = { findSession: async () => session(), findConnection: connection }
const request = (token = signNovaScope(scope, options)) => new Request("http://localhost/eve/v1/sessions", {
  headers: { authorization: `Bearer ${token}` },
})
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url")
const rawClaims = () => ({ ...scope, iss: NOVA_SCOPE_ISSUER, aud: NOVA_SCOPE_AUDIENCE, iat: now / 1000, exp: now / 1000 + 60 })
function signedRaw(claims: unknown, header: unknown = { alg: "HS256", typ: "JWT" }): string {
  const data = `${encode(header)}.${encode(claims)}`
  return `${data}.${createHmac("sha256", secret).update(data).digest("base64url")}`
}

test("valid short-lived scope produces a user principal containing only signed scope", async () => {
  const token = signNovaScope(scope, options)
  expect(verifyNovaScopeToken(token, options)).toEqual(scope)
  const principal = await authenticateNovaScope(request(token), store, env, now)
  expect(principal).toMatchObject({ principalType: "user", authenticator: "nova-scope", attributes: scope })
  expect(JSON.stringify(principal)).not.toContain(secret)
  expect(JSON.stringify(principal)).not.toContain(token)
})

test("principal identity scopes all four IDs but not refreshed model or effort", async () => {
  const principal = await authenticateNovaScope(request(), store, env, now)
  const changed = { ...scope, model: "other-model", effort: "low" as const }
  expect((await authenticateNovaScope(request(signNovaScope(changed, options)), store, env, now))?.principalId)
    .toBe(principal?.principalId)
  for (const key of ["organizationId", "userId", "membershipId", "novaSessionId"] as const) {
    const other = { ...scope, [key]: `${scope[key]}_other` }
    const otherSession = session()
    otherSession.id = other.novaSessionId
    otherSession.organizationId = other.organizationId
    otherSession.initiatorMembership = {
      id: other.membershipId, organizationId: other.organizationId, userId: other.userId, status: "active",
    }
    const principal2 = await authenticateNovaScope(request(signNovaScope(other, options)), {
      findSession: async () => otherSession,
      findConnection: connection,
    }, env, now)
    expect(principal2).not.toBeNull()
    expect(principal2?.principalId).not.toBe(principal?.principalId)
  }
})

test("disabled or unconfigured auth fails closed before accessing the store", async () => {
  let calls = 0
  const unused = { findSession: async () => { calls++; return session() } }
  for (const config of [{}, { ...env, NOVA_EVE_ENABLED: "false" }, { ...env, NOVA_EVE_SCOPE_SECRET: "" }, { ...env, NOVA_EVE_SCOPE_SECRET: "short" }]) {
    expect(await authenticateNovaScope(request(), unused, config, now)).toBeNull()
  }
  expect(calls).toBe(0)
  expect(() => signNovaScope(scope, { secret: "short", now })).toThrow()
  expect(verifyNovaScopeToken(signNovaScope(scope, options), { secret: "short", now })).toBeNull()
})

test("Basic auth, cookies, query params and browser scope fields never establish tenant identity", async () => {
  for (const req of [
    new Request("http://localhost?organizationId=org_1", { headers: { cookie: "session=synthetic" } }),
    new Request("http://localhost", { headers: { authorization: `Basic ${btoa("nova-runtime:synthetic")}` } }),
    new Request("http://localhost", { method: "POST", body: JSON.stringify(scope) }),
  ]) expect(await authenticateNovaScope(req, store, env, now)).toBeNull()
  const req = new Request("http://localhost?organizationId=other", {
    headers: { authorization: `Bearer ${signNovaScope(scope, options)}`, "x-user-id": "other" },
    method: "POST", body: JSON.stringify({ ...scope, userId: "other" }),
  })
  expect((await authenticateNovaScope(req, store, env, now))?.attributes).toEqual(scope)
})

test("tampering, forgery, algorithm substitution and malformed compact encodings are rejected", () => {
  const token = signNovaScope(scope, options)
  const [header, payload, signature] = token.split(".")
  for (const forged of [
    `${header}.${encode({ ...rawClaims(), userId: "other" })}.${signature}`,
    signNovaScope(scope, { ...options, secret: "other-synthetic-signing-key-over-32-bytes" }),
    signedRaw(rawClaims(), { alg: "none", typ: "JWT" }),
    signedRaw(rawClaims(), { alg: "HS512", typ: "JWT" }),
    signedRaw(rawClaims(), { alg: "HS256", typ: "JWT", kid: "attacker" }),
    `${header}.${payload}.`, `${token}.extra`, `${header}=.${payload}.${signature}`, "not-a-token",
    "a".repeat(4097),
  ]) expect(verifyNovaScopeToken(forged, options)).toBeNull()
})

test("claims require complete bounded scope, exact audience/issuer and known fields", () => {
  for (const key of Object.keys(rawClaims())) {
    if (key === "effort") continue
    const claims: Record<string, unknown> = { ...rawClaims() }
    delete claims[key]
    expect(verifyNovaScopeToken(signedRaw(claims), options)).toBeNull()
  }
  for (const patch of [
    { organizationId: "" }, { userId: 3 }, { membershipId: null }, { novaSessionId: ["session_1"] },
    { userId: "user:ambiguous" }, { organizationId: "x".repeat(257) },
    { iss: "other" }, { aud: "other" }, { aud: [NOVA_SCOPE_AUDIENCE] },
    { provider: "unregistered" }, { connectionId: "" }, { connectionId: null }, { model: "" }, { model: " " }, { model: "x".repeat(129) },
    { effort: "max" }, { effort: null }, { secret: "not-allowed" },
  ]) expect(verifyNovaScopeToken(signedRaw({ ...rawClaims(), ...patch }), options)).toBeNull()
  const noEffort = { ...scope }
  delete noEffort.effort
  expect(verifyNovaScopeToken(signNovaScope(noEffort, options), options)).toEqual(noEffort)
})

test("expired, future, noninteger and excessive lifetimes are rejected with exact boundaries", () => {
  const seconds = now / 1000
  for (const patch of [
    { exp: seconds }, { iat: seconds + 1 }, { iat: -1 }, { exp: seconds - 1 },
    { exp: seconds + 301 }, { iat: seconds + 0.5 }, { exp: seconds + 0.5 },
    { iat: "1800000000" }, { exp: null }, { iat: seconds - 10, exp: seconds - 10 },
  ]) expect(verifyNovaScopeToken(signedRaw({ ...rawClaims(), ...patch }), options)).toBeNull()
  const token = signNovaScope(scope, { ...options, ttlSeconds: 1 })
  expect(verifyNovaScopeToken(token, { secret, now: now + 999 })).toEqual(scope)
  expect(verifyNovaScopeToken(token, { secret, now: now + 1000 })).toBeNull()
  for (const ttlSeconds of [0, -1, 301, 1.5, Number.NaN]) {
    expect(() => signNovaScope(scope, { ...options, ttlSeconds })).toThrow()
  }
})

test("signed scope still requires authoritative matching session and membership", async () => {
  const invalid: (NovaScopeSession | null)[] = [null, { ...session(), initiatorMembership: null }]
  for (const key of ["id", "organizationId"] as const) invalid.push({ ...session(), [key]: "other" })
  for (const key of ["id", "organizationId", "userId", "status"] as const) {
    invalid.push({ ...session(), initiatorMembership: { ...session().initiatorMembership!, [key]: "other" } })
  }
  for (const value of invalid) {
    expect(await authenticateNovaScope(request(), { findSession: async () => value }, env, now)).toBeNull()
  }
  for (const key of ["organizationId", "userId", "membershipId", "novaSessionId"] as const) {
    expect(await authenticateNovaScope(request(signNovaScope({ ...scope, [key]: "other" }, options)), store, env, now)).toBeNull()
  }
})

test("revocation is checked on every request and inference recheck without reactivation", async () => {
  const authoritative = session()
  let reads = 0
  const mutableStore = { findSession: async () => { reads++; return authoritative }, findConnection: connection }
  expect(await authenticateNovaScope(request(), mutableStore, env, now)).not.toBeNull()
  for (const status of ["suspended", "invited", "revoked"]) {
    authoritative.initiatorMembership!.status = status
    expect(await authenticateNovaScope(request(), mutableStore, env, now)).toBeNull()
    expect(await authorizeNovaScope(scope, mutableStore)).toBe(false)
    expect(authoritative.initiatorMembership!.status).toBe(status)
  }
  expect(reads).toBe(7)
})

test("store errors fail closed and Prisma store construction performs no imports or queries", async () => {
  const failing = { findSession: async () => { throw new Error("synthetic database failure") } }
  expect(await authenticateNovaScope(request(), failing, env, now)).toBeNull()
  expect(await authorizeNovaScope(scope, failing)).toBe(false)
  expect(typeof createPrismaScopeStore().findSession).toBe("function")
})

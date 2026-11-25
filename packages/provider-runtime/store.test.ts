import { beforeEach, expect, mock, test } from "bun:test"
import { createHash } from "node:crypto"
import { configuredProviderVault } from "./vault"
import { parseStoredProviderConfig } from "./config"

const scope = { userId: "user", organizationId: "org", membershipId: "member", provider: "openai" as const, connectionId: "" }
const revision = new Date("2026-11-22T00:00:00Z")
scope.connectionId = createHash("sha256").update(JSON.stringify([scope.membershipId, scope.provider, revision.toISOString()])).digest("base64url")
const env = { NOVA_CODEX_ENCRYPTION_KEYS: JSON.stringify({ test: Buffer.alloc(32, 7).toString("base64") }), NOVA_CODEX_ENCRYPTION_KEY_VERSION: "test" }
const vault = configuredProviderVault(env)
const binding = JSON.stringify([scope.organizationId, scope.userId, scope.membershipId, scope.provider])
let row: { updatedAt: Date; encryptedApiKey: string } | null
let query: any
mock.module("@super/db", () => ({ default: { novaProviderCredential: { findFirst: async (value: unknown) => { query = value; return row } } } }))
const { readScopedProviderConfig } = await import("./store")

beforeEach(() => {
  row = { updatedAt: revision, encryptedApiKey: vault.seal(JSON.stringify({ apiKey: "synthetic-stored-key", apiFamily: "openai" }), binding) }
  query = undefined
})

test("credential lookup includes all ownership and active connection predicates", async () => {
  expect(await readScopedProviderConfig(scope, env)).toMatchObject({ apiKey: "synthetic-stored-key", apiFamily: "openai" })
  expect(query.where).toEqual({ membershipId: "member", provider: "openai", status: "connected", enabled: true, membership: { id: "member", userId: "user", organizationId: "org", status: "active" } })
  expect(query.select).toEqual({ updatedAt: true, encryptedApiKey: true })
})

test("stale or missing connections fail before decrypting another revision", async () => {
  row = { updatedAt: new Date("2026-11-23T00:00:00Z"), encryptedApiKey: "poison-must-not-be-decrypted" }
  await expect(readScopedProviderConfig(scope, env)).rejects.toThrow("connection changed")
  row = null
  await expect(readScopedProviderConfig(scope, env)).rejects.toThrow("active scoped")
})

test("credential AAD and parsing reject unrelated records without exposing plaintext", async () => {
  row!.encryptedApiKey = vault.seal("synthetic-stored-key", "another-owner")
  await expect(readScopedProviderConfig(scope, env)).rejects.toThrow("could not be decrypted")
  expect(parseStoredProviderConfig("legacy-synthetic-key")).toEqual({ apiKey: "legacy-synthetic-key" })
  for (const value of ["", "{", "[]", '{"apiKey":2}', '{"headers":{"x":3}}', '{"models":[{"id":4}]}']) expect(() => parseStoredProviderConfig(value)).toThrow()
})

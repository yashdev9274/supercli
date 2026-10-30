import { describe, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"

import { codexPublicError } from "./errors"
import { configuredCodexVault } from "./vault"

const testKey = randomBytes(32).toString("base64")
const valid = {
  NOVA_CODEX_ENCRYPTION_KEYS: JSON.stringify({ v1: testKey }),
  NOVA_CODEX_ENCRYPTION_KEY_VERSION: "v1",
}

describe("Codex production vault configuration", () => {
  test("accepts configured keys and surrounding whitespace without changing ciphertext compatibility", () => {
    const vault = configuredCodexVault(valid)
    const encrypted = vault.seal({ test: true }, "binding")
    const padded = configuredCodexVault({
      NOVA_CODEX_ENCRYPTION_KEYS: `\n${JSON.stringify({ v1: ` ${testKey}\n` })}\n`,
      NOVA_CODEX_ENCRYPTION_KEY_VERSION: " v1\n",
    })
    expect(padded.open(encrypted, "binding")).toEqual({ test: true })
  })

  const cases = [
    [{}, "NOVA_CODEX_ENCRYPTION_KEYS is missing"],
    [{ NOVA_CODEX_ENCRYPTION_KEYS: valid.NOVA_CODEX_ENCRYPTION_KEYS }, "NOVA_CODEX_ENCRYPTION_KEY_VERSION is missing"],
    [{ ...valid, NOVA_CODEX_ENCRYPTION_KEY_VERSION: '"v1"' }, "unquoted version"],
    [{ ...valid, NOVA_CODEX_ENCRYPTION_KEYS: "not-json" }, "Paste only the JSON value"],
    [{ ...valid, NOVA_CODEX_ENCRYPTION_KEYS: "null" }, "JSON object"],
    [{ ...valid, NOVA_CODEX_ENCRYPTION_KEYS: "[]" }, "JSON object"],
    [{ ...valid, NOVA_CODEX_ENCRYPTION_KEYS: '"raw-string"' }, "JSON object"],
    [{ ...valid, NOVA_CODEX_ENCRYPTION_KEYS: "{}" }, "no matching entry"],
    [{ ...valid, NOVA_CODEX_ENCRYPTION_KEYS: '{"v1":123}' }, "base64 string"],
    [{ ...valid, NOVA_CODEX_ENCRYPTION_KEYS: '{"v1":"YOUR_BASE64_KEY"}' }, "exactly 32 bytes"],
    [{ ...valid, NOVA_CODEX_ENCRYPTION_KEYS: JSON.stringify({ v1: randomBytes(16).toString("base64") }) }, "exactly 32 bytes"],
  ] as const

  for (const [env, message] of cases) {
    test(`explains ${message}`, () => {
      expect(() => configuredCodexVault(env)).toThrow(message)
      try {
        configuredCodexVault(env)
      } catch (error) {
        const safe = codexPublicError(error)
        expect(safe.statusCode).toBe(503)
        expect(safe.message).not.toContain(testKey)
        expect(safe.message).not.toContain("YOUR_BASE64_KEY")
        expect(safe.message).toContain("redeploy")
      }
    })
  }

  test("keeps runtime environment loading lazy", () => {
    const env = { ...valid, NOVA_CODEX_ENCRYPTION_KEYS: "" }
    expect(() => configuredCodexVault(env)).toThrow("is missing")
    env.NOVA_CODEX_ENCRYPTION_KEYS = valid.NOVA_CODEX_ENCRYPTION_KEYS
    expect(() => configuredCodexVault(env)).not.toThrow()
  })
})

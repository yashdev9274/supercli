import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"
import { CodexError } from "./provider"

export type CodexVault = { seal(value: unknown, binding: string): string; open(value: string, binding: string): unknown }

export function createCodexVault(keys: Record<string, string>, active: string): CodexVault {
  function key(version: string): Buffer {
    const encoded = keys[version]
    if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new CodexError("Codex credential encryption is not configured", 503)
    const decoded = Buffer.from(encoded, "base64")
    if (decoded.length !== 32) throw new CodexError("Codex credential encryption is not configured", 503)
    return decoded
  }
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(active)) throw new CodexError("Codex credential encryption is not configured", 503)
  key(active)
  return {
    seal(value, binding) {
      const nonce = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", key(active), nonce)
      cipher.setAAD(Buffer.from(`nova-codex:v1:${active}:${binding}`))
      const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
      return [active, nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".")
    },
    open(value, binding) {
      try {
        const parts = value.split(".")
        if (parts.length !== 4 || value.length > 262_144) throw new Error()
        const [version, nonce, tag, ciphertext] = parts
        const decipher = createDecipheriv("aes-256-gcm", key(version), Buffer.from(nonce, "base64url"))
        decipher.setAAD(Buffer.from(`nova-codex:v1:${version}:${binding}`))
        decipher.setAuthTag(Buffer.from(tag, "base64url"))
        return JSON.parse(Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8"))
      } catch {
        throw new CodexError("Codex credentials could not be decrypted. Reconnect Codex.", 503)
      }
    },
  }
}

type CodexVaultEnvironment = {
  NOVA_CODEX_ENCRYPTION_KEYS?: string
  NOVA_CODEX_ENCRYPTION_KEY_VERSION?: string
}

export function configuredCodexVault(env: CodexVaultEnvironment = process.env): CodexVault {
  const rawKeys = env.NOVA_CODEX_ENCRYPTION_KEYS?.trim()
  const active = env.NOVA_CODEX_ENCRYPTION_KEY_VERSION?.trim()
  function invalid(reason: string): never {
    throw new CodexError(`Codex encryption configuration: ${reason} Update the Nova server environment and redeploy (Production scope for Vercel).`, 503)
  }
  if (!rawKeys) invalid("NOVA_CODEX_ENCRYPTION_KEYS is missing from this deployment.")
  if (!active) invalid("NOVA_CODEX_ENCRYPTION_KEY_VERSION is missing from this deployment.")
  if (!/^[a-zA-Z0-9_-]{1,32}$/.test(active)) invalid("NOVA_CODEX_ENCRYPTION_KEY_VERSION must be an unquoted version name such as v1.")
  let parsed: unknown
  try {
    parsed = JSON.parse(rawKeys)
  } catch {
    invalid("NOVA_CODEX_ENCRYPTION_KEYS must be a JSON object. Paste only the JSON value, without surrounding single quotes or a variable assignment.")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) invalid("NOVA_CODEX_ENCRYPTION_KEYS must map versions to base64 keys in a JSON object.")
  const entries = parsed as Record<string, unknown>
  if (!Object.hasOwn(entries, active)) invalid("The active key version has no matching entry in NOVA_CODEX_ENCRYPTION_KEYS.")
  const keys: Record<string, string> = Object.create(null)
  for (const [version, value] of Object.entries(entries)) {
    if (typeof value !== "string") invalid("Every encryption key must be a base64 string.")
    const encoded = value.trim()
    if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded) || Buffer.from(encoded, "base64").length !== 32) {
      invalid("Each encryption key must encode exactly 32 bytes as base64. Placeholder values are not valid keys.")
    }
    keys[version] = encoded
  }
  return createCodexVault(keys, active)
}

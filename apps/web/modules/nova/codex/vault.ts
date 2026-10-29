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

export function configuredCodexVault(): CodexVault {
  try {
    return createCodexVault(JSON.parse(process.env.NOVA_CODEX_ENCRYPTION_KEYS ?? "{}"), process.env.NOVA_CODEX_ENCRYPTION_KEY_VERSION ?? "")
  } catch {
    throw new CodexError("Codex credential encryption is not configured. Set NOVA_CODEX_ENCRYPTION_KEYS and NOVA_CODEX_ENCRYPTION_KEY_VERSION on the Nova server, then restart it.", 503)
  }
}

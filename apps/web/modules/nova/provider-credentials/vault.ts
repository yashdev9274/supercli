import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

export class ProviderCredentialError extends Error {
  constructor(message: string, public readonly statusCode = 503) {
    super(message)
    this.name = "ProviderCredentialError"
  }
}

export type ProviderVault = {
  seal(value: string, binding: string): string
  open(value: string, binding: string): string
}

export function configuredProviderVault(env: {
  NOVA_CODEX_ENCRYPTION_KEYS?: string
  NOVA_CODEX_ENCRYPTION_KEY_VERSION?: string
} = {
  NOVA_CODEX_ENCRYPTION_KEYS: process.env.NOVA_CODEX_ENCRYPTION_KEYS,
  NOVA_CODEX_ENCRYPTION_KEY_VERSION: process.env.NOVA_CODEX_ENCRYPTION_KEY_VERSION,
}): ProviderVault {
  const active = env.NOVA_CODEX_ENCRYPTION_KEY_VERSION?.trim()
  const raw = env.NOVA_CODEX_ENCRYPTION_KEYS?.trim()
  if (!active || !raw) throw new ProviderCredentialError("Provider credential encryption is not configured")
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new ProviderCredentialError("Provider credential encryption is invalid") }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ProviderCredentialError("Provider credential encryption is invalid")
  const keys = parsed as Record<string, unknown>
  const keyFor = (version: string) => {
    const encoded = keys[version]
    if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new ProviderCredentialError("Provider credential encryption is invalid")
    const key = Buffer.from(encoded, "base64")
    if (key.length !== 32) throw new ProviderCredentialError("Provider credential encryption is invalid")
    return key
  }
  keyFor(active)
  return {
    seal(value, binding) {
      const nonce = randomBytes(12)
      const cipher = createCipheriv("aes-256-gcm", keyFor(active), nonce)
      cipher.setAAD(Buffer.from(`nova-provider:v1:${active}:${binding}`))
      const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
      return [active, nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), body.toString("base64url")].join(".")
    },
    open(value, binding) {
      try {
        const [version, nonce, tag, body] = value.split(".")
        if (!version || !nonce || !tag || !body || value.length > 262_144) throw new Error()
        const decipher = createDecipheriv("aes-256-gcm", keyFor(version), Buffer.from(nonce, "base64url"))
        decipher.setAAD(Buffer.from(`nova-provider:v1:${version}:${binding}`))
        decipher.setAuthTag(Buffer.from(tag, "base64url"))
        return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8")
      } catch { throw new ProviderCredentialError("Provider credentials could not be decrypted. Reconnect the provider.") }
    },
  }
}

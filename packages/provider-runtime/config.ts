import { ProviderCredentialError } from "./vault"

export type StoredProviderConfig = {
  apiKey?: string
  name?: string
  baseUrl?: string
  apiFamily?: "openai" | "anthropic" | "google"
  headers?: Record<string, string>
  models?: Array<{ id: string; label: string; description?: string }>
}

export function parseStoredProviderConfig(value: string): StoredProviderConfig {
  if (!value.trim()) {
    throw new ProviderCredentialError("Saved provider configuration is invalid. Reconnect the provider.")
  }
  if (!/^[\[{]/.test(value.trimStart())) return { apiKey: value }
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new ProviderCredentialError("Saved provider configuration is invalid. Reconnect the provider.")
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ProviderCredentialError("Saved provider configuration is invalid. Reconnect the provider.")
  }
  const config = parsed as Record<string, unknown>
  const invalid = ["apiKey", "name", "baseUrl"].some((key) => config[key] !== undefined && typeof config[key] !== "string")
    || (config.apiFamily !== undefined && !["openai", "anthropic", "google"].includes(config.apiFamily as string))
    || (config.headers !== undefined && (
      !config.headers || typeof config.headers !== "object" || Array.isArray(config.headers)
      || Object.values(config.headers).some((header) => typeof header !== "string")
    ))
    || (config.models !== undefined && (
      !Array.isArray(config.models) || config.models.some((model: unknown) => {
        if (!model || typeof model !== "object" || Array.isArray(model)) return true
        const entry = model as Record<string, unknown>
        return typeof entry.id !== "string" || !entry.id.trim()
          || typeof entry.label !== "string" || !entry.label.trim()
          || (entry.description !== undefined && typeof entry.description !== "string")
      })
    ))
  if (invalid) throw new ProviderCredentialError("Saved provider configuration is invalid. Reconnect the provider.")
  return {
    apiKey: config.apiKey as string | undefined,
    name: config.name as string | undefined,
    baseUrl: config.baseUrl as string | undefined,
    apiFamily: config.apiFamily as StoredProviderConfig["apiFamily"],
    headers: config.headers as StoredProviderConfig["headers"],
    models: config.models as StoredProviderConfig["models"],
  }
}

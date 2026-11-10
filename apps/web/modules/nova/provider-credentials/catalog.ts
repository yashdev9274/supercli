import type { ProviderCredentialProvider, StoredProviderConfig } from "./server"

export type ProviderCatalogModel = { id: string; label: string; description: string; apiFamily?: "openai" | "anthropic" | "google" }

function basic(key: string) {
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`
}

function normalize(body: unknown): ProviderCatalogModel[] {
  const raw = Array.isArray(body) ? body : body && typeof body === "object"
    ? (Array.isArray((body as { data?: unknown }).data) ? (body as { data: unknown[] }).data : Array.isArray((body as { models?: unknown }).models) ? (body as { models: unknown[] }).models : [])
    : []
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const value = item as Record<string, unknown>
    const id = typeof value.id === "string" ? value.id : typeof value.model === "string" ? value.model : ""
    if (!id || id.length > 200) return []
    const label = typeof value.name === "string" ? value.name : typeof value.display_name === "string" ? value.display_name : id
    const description = typeof value.description === "string" ? value.description : "Available through the connected provider"
    const api = typeof value.api === "string" ? value.api : typeof value.apiFamily === "string" ? value.apiFamily : undefined
    const apiFamily = api === "anthropic" || api === "google" || api === "openai" ? api : undefined
    return [{ id, label: label.slice(0, 200), description: description.slice(0, 500), apiFamily }]
  })
}

function endpointFor(provider: ProviderCredentialProvider, config: StoredProviderConfig) {
  if (config.baseUrl?.trim()) return config.baseUrl.trim().replace(/\/$/, "")
  if (provider === "cursor") return "https://api.cursor.com/v1"
  if (provider === "opencode") return "https://opencode.ai/inference/v1"
  return ""
}

export async function fetchProviderCatalog(provider: ProviderCredentialProvider, configOrApiKey: StoredProviderConfig | string, signal?: AbortSignal) {
  const config: StoredProviderConfig = typeof configOrApiKey === "string" ? { apiKey: configOrApiKey } : configOrApiKey
  const baseUrl = endpointFor(provider, config)
  if (!baseUrl) return []
  const authHeaders: Record<string, string> = {}
  if (config.apiKey) {
    if (config.apiFamily === "anthropic") {
      authHeaders["x-api-key"] = config.apiKey
      authHeaders["anthropic-version"] = "2023-06-01"
    } else {
      authHeaders.Authorization = provider === "cursor" ? basic(config.apiKey) : `Bearer ${config.apiKey}`
    }
  }
  const headers = config.apiFamily === "anthropic"
    ? { ...(config.headers ?? {}), ...authHeaders, Accept: "application/json", "User-Agent": "Nova Web" }
    : { ...(config.headers ?? {}), ...authHeaders, Accept: "application/json", "User-Agent": "Nova Web" }
  const modelsPath = config.apiFamily === "anthropic" && !baseUrl.endsWith("/v1") ? "/v1/models" : "/models"
  const response = await fetch(`${baseUrl}${modelsPath}`, { headers, cache: "no-store", signal })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 402 && provider === "ollama") throw new Error("Ollama Cloud returned HTTP 402. This API key needs available cloud credits or an active paid plan.")
    throw new Error(typeof body === "object" && body && "message" in body && typeof body.message === "string" ? body.message : `${provider === "ollama" ? "Ollama Cloud" : provider} returned HTTP ${response.status}`)
  }
  return normalize(body)
}

export { endpointFor }

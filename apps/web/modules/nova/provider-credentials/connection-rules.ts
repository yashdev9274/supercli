export function isLocalOllamaUrl(provider: string, baseUrl?: string) {
  if (provider !== "ollama" || !baseUrl) return false
  try {
    const url = new URL(baseUrl)
    return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && (url.protocol === "http:" || url.protocol === "https:")
  } catch {
    return false
  }
}

export function requiresProviderApiKey(provider: string, baseUrl?: string) {
  return !isLocalOllamaUrl(provider, baseUrl)
}

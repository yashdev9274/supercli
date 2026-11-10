import type { BrandLogo } from "./model-logos"

export type ProviderIntegrationCategory = "subscription" | "gateway" | "api-key" | "custom"
export type ProviderIntegration = {
  id: string
  label: string
  subtitle: string
  category: ProviderIntegrationCategory
  baseUrl: string
  apiFamily: "openai" | "anthropic" | "google"
  credentialLabel: string
  docsUrl?: string
  logo: BrandLogo
}

const mark = (name: string): BrandLogo => ({ src: `/logos/models/${name}.svg`, monochrome: true })
const crop = (name: string): BrandLogo => ({ src: `/logos/providers/crops/${name}.png`, monochrome: false })

export const PROVIDER_INTEGRATIONS: ProviderIntegration[] = [
  { id: "claude-code", label: "Claude Code", subtitle: "Setup token", category: "subscription", baseUrl: "", apiFamily: "anthropic", credentialLabel: "Setup token", logo: crop("claude-code") },
  { id: "codex", label: "Codex", subtitle: "Device sign-in", category: "subscription", baseUrl: "", apiFamily: "openai", credentialLabel: "ChatGPT subscription", logo: crop("codex") },
  { id: "github-copilot", label: "GitHub Copilot", subtitle: "Device sign-in", category: "subscription", baseUrl: "", apiFamily: "openai", credentialLabel: "GitHub Copilot", logo: crop("github-copilot") },
  { id: "supergrok", label: "SuperGrok", subtitle: "Device sign-in", category: "subscription", baseUrl: "", apiFamily: "openai", credentialLabel: "SuperGrok", logo: crop("supergrok") },
  { id: "vercel", label: "Vercel AI Gateway", subtitle: "ai-gateway.vercel.sh", category: "gateway", baseUrl: "https://ai-gateway.vercel.sh/v1", apiFamily: "openai", credentialLabel: "API key", docsUrl: "https://vercel.com/ai-gateway", logo: crop("vercel") },
  { id: "openrouter", label: "OpenRouter", subtitle: "openrouter.ai", category: "gateway", baseUrl: "https://openrouter.ai/api/v1", apiFamily: "openai", credentialLabel: "API key", docsUrl: "https://openrouter.ai/keys", logo: mark("openrouter") },
  { id: "cloudflare", label: "Cloudflare AI Gateway", subtitle: "gateway.ai.cloudflare.com", category: "gateway", baseUrl: "", apiFamily: "openai", credentialLabel: "API key", docsUrl: "https://developers.cloudflare.com/ai-gateway/", logo: crop("cloudflare") },
  { id: "ollama", label: "Ollama Cloud", subtitle: "ollama.com", category: "gateway", baseUrl: "https://ollama.com/v1", apiFamily: "openai", credentialLabel: "API key", docsUrl: "https://ollama.com/settings/keys", logo: crop("ollama") },
  { id: "neon", label: "Neon AI Gateway", subtitle: "console.neon.tech", category: "gateway", baseUrl: "", apiFamily: "openai", credentialLabel: "API key", logo: mark("neon") },
  { id: "bedrock", label: "Amazon Bedrock", subtitle: "bedrock-mantle.{region}.api.aws", category: "gateway", baseUrl: "", apiFamily: "openai", credentialLabel: "API key", logo: crop("bedrock") },
  { id: "baseten", label: "Baseten", subtitle: "inference.baseten.co", category: "gateway", baseUrl: "https://inference.baseten.co/v1", apiFamily: "openai", credentialLabel: "API key", logo: crop("baseten") },
  { id: "fireworks", label: "Fireworks", subtitle: "api.fireworks.ai", category: "gateway", baseUrl: "https://api.fireworks.ai/inference/v1", apiFamily: "openai", credentialLabel: "API key", logo: crop("fireworks") },
  { id: "together", label: "Together AI", subtitle: "api.together.xyz", category: "gateway", baseUrl: "https://api.together.xyz/v1", apiFamily: "openai", credentialLabel: "API key", logo: crop("together") },
  { id: "deepinfra", label: "DeepInfra", subtitle: "api.deepinfra.com", category: "gateway", baseUrl: "https://api.deepinfra.com/v1/openai", apiFamily: "openai", credentialLabel: "API key", logo: crop("deepinfra") },
  { id: "nvidia", label: "NVIDIA", subtitle: "integrate.api.nvidia.com", category: "gateway", baseUrl: "https://integrate.api.nvidia.com/v1", apiFamily: "openai", credentialLabel: "API key", logo: crop("nvidia") },
  { id: "cursor", label: "Cursor Cloud Agents", subtitle: "Coding plan", category: "gateway", baseUrl: "https://api.cursor.com/v1", apiFamily: "openai", credentialLabel: "API key", logo: mark("cursor") },
  { id: "opencode", label: "OpenCode Go", subtitle: "Coding plan", category: "gateway", baseUrl: "https://opencode.ai/inference/openai/v1", apiFamily: "openai", credentialLabel: "API key", logo: mark("opencode") },
  { id: "kimi", label: "Kimi Code", subtitle: "Coding plan", category: "gateway", baseUrl: "https://api.moonshot.ai/v1", apiFamily: "openai", credentialLabel: "API key", logo: mark("kimi") },
  { id: "zai-coding", label: "GLM Coding Plan", subtitle: "Coding plan", category: "gateway", baseUrl: "https://api.z.ai/api/coding/paas/v4", apiFamily: "openai", credentialLabel: "API key", logo: mark("zai") },
  { id: "anthropic", label: "Anthropic", subtitle: "api.anthropic.com", category: "api-key", baseUrl: "https://api.anthropic.com", apiFamily: "anthropic", credentialLabel: "API key", docsUrl: "https://console.anthropic.com/settings/keys", logo: mark("anthropic") },
  { id: "openai", label: "OpenAI", subtitle: "api.openai.com", category: "api-key", baseUrl: "https://api.openai.com/v1", apiFamily: "openai", credentialLabel: "API key", docsUrl: "https://platform.openai.com/api-keys", logo: mark("openai") },
  { id: "xai", label: "xAI", subtitle: "api.x.ai", category: "api-key", baseUrl: "https://api.x.ai/v1", apiFamily: "openai", credentialLabel: "API key", docsUrl: "https://console.x.ai/", logo: mark("xai") },
  { id: "google", label: "Google", subtitle: "generativelanguage.googleapis.com", category: "api-key", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiFamily: "openai", credentialLabel: "API key", docsUrl: "https://aistudio.google.com/app/apikey", logo: mark("gemini") },
  { id: "meta", label: "Meta Model API", subtitle: "api.meta.ai", category: "api-key", baseUrl: "", apiFamily: "openai", credentialLabel: "API key", logo: mark("meta") },
  { id: "custom", label: "Custom endpoint", subtitle: "Your own base URL", category: "custom", baseUrl: "", apiFamily: "openai", credentialLabel: "API key", logo: crop("custom") },
]

export const PROVIDER_INTEGRATION_BY_ID = Object.fromEntries(PROVIDER_INTEGRATIONS.map((item) => [item.id, item])) as Record<string, ProviderIntegration>
export const API_KEY_PROVIDER_IDS = PROVIDER_INTEGRATIONS.filter((item) => item.category !== "subscription").map((item) => item.id)
export const SUBSCRIPTION_PROVIDER_IDS = PROVIDER_INTEGRATIONS.filter((item) => item.category === "subscription").map((item) => item.id)

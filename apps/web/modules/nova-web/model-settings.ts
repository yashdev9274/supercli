import { codexEffortSchema } from "../nova/codex/models"
import { ALL_MODELS, HARNESS_PROVIDERS, findModel, type HarnessProvider, type NovaModelEntry, type NovaEffort } from "./models"

export type ProviderConfiguration = {
  credential: string
  baseUrl?: string
  description: string
}

// Environment variable names used by the terminal harness /api/ai/chat handler.
// This is setup documentation, not a claim that a credential is configured.
export const PROVIDER_CONFIGURATION: Record<HarnessProvider, ProviderConfiguration> = {
  codex: { credential: "ChatGPT subscription", description: "Connect Codex with device authorization. Account models and reasoning levels are loaded from OpenAI; encrypted credentials stay on Nova’s backend." },
  neon: { credential: "NEON_AI_GATEWAY_TOKEN", baseUrl: "NEON_AI_GATEWAY_BASE_URL", description: "Branch-scoped Neon gateway. Configure the bare HTTPS branch URL (no API path) and a branch token with ai_gateway:invoke on the harness server, not a Neon management API key. Model availability and credits depend on your Neon project. Claude uses Messages, OpenAI uses Responses, and other models use Chat Completions. Gemini structured output and multi-step tools are currently unsupported; Responses tool continuations may fail upstream." },
  supercode: { credential: "CONCENTRATEAI_API_KEY", description: "Managed cloud models. Access is subject to your harness plan and usage limits." },
  concentrateai: { credential: "CONCENTRATEAI_API_KEY", description: "ConcentrateAI gateway. Nova uses the harness credential; without a forwarded personal key, the cloud allowlist applies." },
  mergedev: { credential: "MERGE_DEV_API_KEY", description: "Merge Dev's OpenAI-compatible gateway, configured on the harness server." },
  google: { credential: "GOOGLE_GENERATIVE_AI_API_KEY", description: "Google Gemini through the harness's Google Generative AI integration." },
  minimax: { credential: "MINIMAX_API_KEY", description: "MiniMax models through the harness's MiniMax integration." },
  nvidia: { credential: "NVIDIA_API_KEY", description: "NVIDIA NIM inference, configured on the harness server." },
  openrouter: { credential: "OPENROUTER_API_KEY", description: "OpenRouter's model gateway, configured on the harness server." },
  orcarouter: { credential: "ORCAROUTER_API_KEY", description: "OrcaRouter's model gateway, including automatic model routing." },
}

export function parseModelSelection(raw: string | null): { provider: HarnessProvider; model: string; effort?: NovaEffort } | null {
  if (!raw) return null
  try {
    const selection: unknown = JSON.parse(raw)
    if (!selection || typeof selection !== "object" || !("provider" in selection) || !("model" in selection)) return null
    if (typeof selection.provider !== "string" || typeof selection.model !== "string") return null
    if (selection.model.length < 1 || selection.model.length > 128) return null
    const effort = "effort" in selection ? codexEffortSchema.safeParse(selection.effort) : null
    if (selection.provider === "codex") return { provider: "codex", model: selection.model, ...(effort?.success ? { effort: effort.data } : {}) }
    const entry = findModel(selection.provider, selection.model)
    return entry ? { provider: entry.provider, model: entry.id, ...(effort?.success && effort.data !== "none" && effort.data !== "minimal" ? { effort: effort.data } : {}) } : null
  } catch {
    return null
  }
}

export function filterSettingsModels(query: string, provider: HarnessProvider | "all"): NovaModelEntry[] {
  const search = query.trim().toLowerCase()
  return ALL_MODELS.filter((model) => {
    if (provider !== "all" && model.provider !== provider) return false
    const label = HARNESS_PROVIDERS.find((item) => item.id === model.provider)?.label ?? model.provider
    return !search || `${model.label} ${model.id} ${model.desc} ${label}`.toLowerCase().includes(search)
  })
}

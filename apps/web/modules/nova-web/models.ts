/** Auto-synced from supercode-cli slashCommands/model.ts — 133 models. */

export type HarnessProvider =
  | "supercode"
  | "concentrateai"
  | "mergedev"
  | "google"
  | "minimax"
  | "nvidia"
  | "openrouter"
  | "orcarouter"

export type NovaModelEntry = {
  id: string
  provider: HarnessProvider
  label: string
  desc: string
  cost?: string
}

export type NovaProviderMeta = {
  id: HarnessProvider
  label: string
  shortLabel: string
  isCloud: boolean
}

export const HARNESS_PROVIDERS: NovaProviderMeta[] = [
  { id: "supercode", label: "Supercode Cloud", shortLabel: "Cloud", isCloud: true },
  { id: "concentrateai", label: "ConcentrateAI", shortLabel: "Concentrate", isCloud: false },
  { id: "mergedev", label: "Merge Dev Gateway", shortLabel: "Merge", isCloud: false },
  { id: "google", label: "Google Gemini", shortLabel: "Gemini", isCloud: false },
  { id: "minimax", label: "MiniMax", shortLabel: "MiniMax", isCloud: false },
  { id: "nvidia", label: "NVIDIA NIM", shortLabel: "NVIDIA", isCloud: false },
  { id: "openrouter", label: "OpenRouter", shortLabel: "OpenRouter", isCloud: false },
  { id: "orcarouter", label: "OrcaRouter", shortLabel: "Orca", isCloud: false },
]

export const ALL_MODELS: NovaModelEntry[] = [
  { id: "deepseek-v4-flash", provider: "supercode", label: "DeepSeek V4 Flash", desc: "Fast & capable" },
  { id: "kimi-k2-6", provider: "supercode", label: "Kimi K2.6", desc: "Long context" },
  { id: "kimi-k2-7-code", provider: "supercode", label: "Kimi K2.7 Code", desc: "Code specialist" },
  { id: "kimi-k3", provider: "supercode", label: "Kimi K3", desc: "Moonshot latest" },
  { id: "minimax-m3", provider: "supercode", label: "MiniMax M3", desc: "Fast & smart" },
  { id: "glm-5.2", provider: "supercode", label: "GLM 5.2", desc: "Latest GLM" },
  { id: "glm-5.1", provider: "supercode", label: "GLM 5.1", desc: "Stable & reliable" },
  { id: "mimo-v2.5", provider: "supercode", label: "Mimo v2.5", desc: "Novita" },
  { id: "hy3", provider: "supercode", label: "Hunyuan Hy3", desc: "Tencent flagship" },
  { id: "gemini-2.5-flash", provider: "supercode", label: "Gemini 2.5 Flash", desc: "Google smart & fast" },
  { id: "meta/llama-3.3-70b-instruct", provider: "supercode", label: "Llama 3.3 70B", desc: "Open weights" },
  { id: "orcarouter/auto", provider: "supercode", label: "OrcaRouter Auto", desc: "Auto-pick cheapest" },
  { id: "stealth/ox-alpha", provider: "supercode", label: "OX Alpha", desc: "Free · Coding & reasoning" },
  { id: "anthropic/claude-opus-5", provider: "concentrateai", label: "Claude Opus 5", desc: "Most capable" },
  { id: "anthropic/claude-opus-4-8", provider: "concentrateai", label: "Claude Opus 4.8", desc: "Deep reasoning" },
  { id: "anthropic/claude-opus-4", provider: "concentrateai", label: "Claude Opus 4", desc: "Top-tier reasoning" },
  { id: "anthropic/claude-sonnet-4-5", provider: "concentrateai", label: "Claude Sonnet 4.5", desc: "Latest sonnet" },
  { id: "anthropic/claude-sonnet-4", provider: "concentrateai", label: "Claude Sonnet 4", desc: "Balanced" },
  { id: "anthropic/claude-3-5-haiku", provider: "concentrateai", label: "Claude 3.5 Haiku", desc: "Fast & cheap" },
  { id: "openai/gpt-4o", provider: "concentrateai", label: "GPT-4o", desc: "OpenAI flagship" },
  { id: "openai/gpt-4o-mini", provider: "concentrateai", label: "GPT-4o Mini", desc: "Cheap & fast" },
  { id: "openai/gpt-4-1", provider: "concentrateai", label: "GPT-4.1", desc: "Latest GPT" },
  { id: "openai/o3-mini", provider: "concentrateai", label: "o3-mini", desc: "Reasoning mini" },
  { id: "openai/o4-mini", provider: "concentrateai", label: "o4-mini", desc: "Reasoning v4 mini" },
  { id: "x-ai/grok-4-5", provider: "concentrateai", label: "Grok 4.5", desc: "xAI latest" },
  { id: "x-ai/grok-3", provider: "concentrateai", label: "Grok 3", desc: "xAI flagship" },
  { id: "x-ai/grok-3-mini", provider: "concentrateai", label: "Grok 3 Mini", desc: "Compact Grok" },
  { id: "deepseek/deepseek-v4-flash", provider: "concentrateai", label: "DeepSeek V4 Flash", desc: "Fast & capable" },
  { id: "deepseek/deepseek-v3", provider: "concentrateai", label: "DeepSeek V3", desc: "DeepSeek flagship" },
  { id: "deepseek/deepseek-r1", provider: "concentrateai", label: "DeepSeek R1", desc: "Reasoning model" },
  { id: "meta-llama/llama-4-maverick", provider: "concentrateai", label: "Llama 4 Maverick", desc: "Latest Llama" },
  { id: "z-ai/glm-5-2", provider: "concentrateai", label: "GLM 5.2", desc: "Latest GLM" },
  { id: "kimi-k3", provider: "concentrateai", label: "Kimi K3", desc: "Moonshot latest" },
  { id: "kimi-k2-6", provider: "concentrateai", label: "Kimi K2.6", desc: "Long context" },
  { id: "minimax/minimax-m3", provider: "concentrateai", label: "MiniMax M3", desc: "Fast & smart" },
  { id: "anthropic/claude-opus-5", provider: "mergedev", label: "Claude Opus 5", desc: "Most capable", cost: "50x" },
  { id: "anthropic/claude-sonnet-4-6", provider: "mergedev", label: "Claude Sonnet 4.6", desc: "Latest sonnet", cost: "12x" },
  { id: "anthropic/claude-opus-4-8", provider: "mergedev", label: "Claude Opus 4.8", desc: "Deep reasoning", cost: "40x" },
  { id: "gpt-4o", provider: "mergedev", label: "GPT-4o", desc: "OpenAI flagship", cost: "4x" },
  { id: "xai/grok-4.3", provider: "mergedev", label: "Grok 4.3", desc: "Via Merge Dev", cost: "10x" },
  { id: "google/gemini-2.5-flash", provider: "mergedev", label: "Gemini 2.5 Flash", desc: "Via Merge Dev", cost: "2x" },
  { id: "google/gemini-2.5-pro", provider: "mergedev", label: "Gemini 2.5 Pro", desc: "Via Merge Dev", cost: "4x" },
  { id: "deepseek/deepseek-v4-flash", provider: "mergedev", label: "DeepSeek V4 Flash", desc: "Via Merge Dev", cost: "1.2x" },
  { id: "moonshot/kimi-k3", provider: "mergedev", label: "Kimi K3", desc: "Via Merge Dev", cost: "3x" },
  { id: "anthropic/claude-opus-4-20250514", provider: "mergedev", label: "Claude Opus 4", desc: "Top-tier reasoning", cost: "30x" },
  { id: "anthropic/claude-sonnet-4-5-20250929", provider: "mergedev", label: "Claude Sonnet 4.5", desc: "Latest sonnet", cost: "15x" },
  { id: "gpt-4o-mini", provider: "mergedev", label: "GPT-4o Mini", desc: "Cheap & fast", cost: "1x" },
  { id: "gpt-4.1", provider: "mergedev", label: "GPT-4.1", desc: "Latest GPT", cost: "3x" },
  { id: "o3-mini", provider: "mergedev", label: "o3-mini", desc: "Reasoning mini", cost: "3x" },
  { id: "o4-mini", provider: "mergedev", label: "o4-mini", desc: "Reasoning v4 mini", cost: "3x" },
  { id: "xai/grok-4.5", provider: "mergedev", label: "Grok 4.5", desc: "xAI latest", cost: "15x" },
  { id: "deepseek/deepseek-v3", provider: "mergedev", label: "DeepSeek V3", desc: "DeepSeek flagship", cost: "1.5x" },
  { id: "deepseek/deepseek-r1", provider: "mergedev", label: "DeepSeek R1", desc: "Reasoning model", cost: "4x" },
  { id: "meta/llama-4-maverick-17b-128e-instruct", provider: "mergedev", label: "Llama 4 Maverick", desc: "Latest Llama", cost: "2x" },
  { id: "moonshot/kimi-k2.6", provider: "mergedev", label: "Kimi K2.6", desc: "Long context", cost: "3x" },
  { id: "minimax/minimax-m3", provider: "mergedev", label: "MiniMax M3", desc: "Fast & smart", cost: "1.5x" },
  { id: "gemini-2.5-flash", provider: "google", label: "Gemini 2.5 Flash", desc: "Smart & fast", cost: "2.0x" },
  { id: "gemini-2.5-pro", provider: "google", label: "Gemini 2.5 Pro", desc: "Deep reasoning", cost: "4.0x" },
  { id: "gemini-2.0-flash", provider: "google", label: "Gemini 2.0 Flash", desc: "Previous gen", cost: "1.5x" },
  { id: "gemini-2.5-flash-preview", provider: "google", label: "Gemini 2.5 Flash Preview", desc: "Latest preview", cost: "2.0x" },
  { id: "gemini-2.5-pro-preview", provider: "google", label: "Gemini 2.5 Pro Preview", desc: "Max preview", cost: "4.0x" },
  { id: "learnlm-1.5-pro", provider: "google", label: "LearnLM 1.5 Pro", desc: "Teaching optimized", cost: "1.0x" },
  { id: "MiniMax-M2", provider: "minimax", label: "MiniMax M2", desc: "MiniMax flagship", cost: "0.8x" },
  { id: "MiniMax-M3", provider: "minimax", label: "MiniMax M3", desc: "Fast & smart", cost: "0.5x" },
  { id: "meta/llama-3.1-405b-instruct", provider: "nvidia", label: "Llama 3.1 405B", desc: "Via NVIDIA NIM", cost: "2.0x" },
  { id: "meta/llama-3.3-70b-instruct", provider: "nvidia", label: "Llama 3.3 70B", desc: "Open weights", cost: "1.2x" },
  { id: "meta/llama-3.1-70b-instruct", provider: "nvidia", label: "Llama 3.1 70B", desc: "Via NVIDIA NIM", cost: "1.0x" },
  { id: "meta/llama-3.1-8b-instruct", provider: "nvidia", label: "Llama 3.1 8B", desc: "Via NVIDIA NIM", cost: "0.5x" },
  { id: "nvidia/llama-3.1-nemotron-70b-instruct", provider: "nvidia", label: "Nemotron 70B", desc: "RLHF optimized", cost: "1.2x" },
  { id: "nvidia/llama-3.1-nemotron-ultra-253b", provider: "nvidia", label: "Nemotron Ultra 253B", desc: "Biggest NIM", cost: "2.5x" },
  { id: "mistralai/mistral-7b-instruct-v0.3", provider: "nvidia", label: "Mistral 7B", desc: "Via NVIDIA NIM", cost: "0.5x" },
  { id: "qwen/qwen2.5-72b-instruct", provider: "nvidia", label: "Qwen 2.5 72B", desc: "Via NVIDIA NIM", cost: "1.2x" },
  { id: "minimaxai/minimax-m3", provider: "nvidia", label: "MiniMax M3", desc: "Via NVIDIA NIM", cost: "0.5x" },
  { id: "deepseek-ai/deepseek-v4-flash", provider: "nvidia", label: "DeepSeek V4 Flash", desc: "Via NVIDIA NIM", cost: "1.0x" },
  { id: "stealth/ox-alpha", provider: "openrouter", label: "OX Alpha", desc: "Free · Coding & reasoning" },
  { id: "anthropic/claude-opus-5", provider: "openrouter", label: "Claude Opus 5", desc: "Most capable", cost: "50x" },
  { id: "anthropic/claude-opus-4-8", provider: "openrouter", label: "Claude Opus 4.8", desc: "Deep reasoning", cost: "40x" },
  { id: "anthropic/claude-opus-4", provider: "openrouter", label: "Claude Opus 4", desc: "Top-tier reasoning", cost: "30x" },
  { id: "anthropic/claude-sonnet-4", provider: "openrouter", label: "Claude Sonnet 4", desc: "Balanced", cost: "12x" },
  { id: "anthropic/claude-sonnet-4.5", provider: "openrouter", label: "Claude Sonnet 4.5", desc: "Latest sonnet", cost: "10x" },
  { id: "anthropic/claude-3.5-haiku", provider: "openrouter", label: "Claude 3.5 Haiku", desc: "Fast & cheap", cost: "3x" },
  { id: "openai/gpt-4o", provider: "openrouter", label: "GPT-4o", desc: "OpenAI flagship", cost: "4x" },
  { id: "openai/gpt-4o-mini", provider: "openrouter", label: "GPT-4o Mini", desc: "Cheap & fast", cost: "0.5x" },
  { id: "openai/gpt-4.1", provider: "openrouter", label: "GPT-4.1", desc: "Latest GPT", cost: "3x" },
  { id: "openai/gpt-4.1-mini", provider: "openrouter", label: "GPT-4.1 Mini", desc: "Compact GPT", cost: "1x" },
  { id: "openai/gpt-4.1-nano", provider: "openrouter", label: "GPT-4.1 Nano", desc: "Tiny & fast", cost: "0.3x" },
  { id: "openai/o3-mini", provider: "openrouter", label: "o3-mini", desc: "Reasoning mini", cost: "3x" },
  { id: "openai/o4-mini", provider: "openrouter", label: "o4-mini", desc: "Reasoning v4 mini", cost: "3x" },
  { id: "openai/gpt-oss-120b:free", provider: "openrouter", label: "GPT OSS 120B", desc: "Open-weight" },
  { id: "x-ai/grok-3", provider: "openrouter", label: "Grok 3", desc: "xAI flagship", cost: "10x" },
  { id: "x-ai/grok-3-mini", provider: "openrouter", label: "Grok 3 Mini", desc: "Compact Grok", cost: "5x" },
  { id: "x-ai/grok-3-mini-fast", provider: "openrouter", label: "Grok 3 Mini Fast", desc: "Fast Grok", cost: "5x" },
  { id: "deepseek/deepseek-v4-flash", provider: "openrouter", label: "DeepSeek V4 Flash", desc: "Via OpenRouter", cost: "1.2x" },
  { id: "deepseek/deepseek-v3", provider: "openrouter", label: "DeepSeek V3", desc: "DeepSeek flagship", cost: "1.5x" },
  { id: "deepseek/deepseek-r1", provider: "openrouter", label: "DeepSeek R1", desc: "Reasoning model", cost: "4x" },
  { id: "meta-llama/llama-4-maverick", provider: "openrouter", label: "Llama 4 Maverick", desc: "Latest Llama", cost: "2x" },
  { id: "meta-llama/llama-4-scout", provider: "openrouter", label: "Llama 4 Scout", desc: "Lightweight Llama", cost: "1x" },
  { id: "meta-llama/llama-3.3-70b", provider: "openrouter", label: "Llama 3.3 70B", desc: "Open weights", cost: "1.2x" },
  { id: "mistral/mistral-large", provider: "openrouter", label: "Mistral Large", desc: "Mistral flagship", cost: "4x" },
  { id: "mistral/mistral-small", provider: "openrouter", label: "Mistral Small", desc: "Compact Mistral", cost: "0.5x" },
  { id: "mistral/codestral-2501", provider: "openrouter", label: "Codestral", desc: "Code specialist", cost: "2x" },
  { id: "google/gemini-2.5-pro", provider: "openrouter", label: "Gemini 2.5 Pro", desc: "Via OpenRouter", cost: "4x" },
  { id: "google/gemini-2.5-flash", provider: "openrouter", label: "Gemini 2.5 Flash", desc: "Via OpenRouter", cost: "2x" },
  { id: "qwen/qwen-2.5-72b", provider: "openrouter", label: "Qwen 2.5 72B", desc: "Alibaba flagship", cost: "1.2x" },
  { id: "qwen/qwen-2.5-coder-32b", provider: "openrouter", label: "Qwen 2.5 Coder 32B", desc: "Coding specialist", cost: "1x" },
  { id: "qwen/qwq-32b", provider: "openrouter", label: "QWQ 32B", desc: "Reasoning model", cost: "1.2x" },
  { id: "cohere/command-r-plus", provider: "openrouter", label: "Command R+", desc: "Cohere flagship", cost: "3x" },
  { id: "minimax/minimax-m3", provider: "openrouter", label: "MiniMax M3", desc: "Via OpenRouter", cost: "3.0x" },
  { id: "z-ai/glm-5.1", provider: "openrouter", label: "GLM 5.1", desc: "Via OpenRouter", cost: "1.0x" },
  { id: "moonshotai/kimi-k2.6", provider: "openrouter", label: "Kimi K2.6", desc: "Via OpenRouter", cost: "1.5x" },
  { id: "anthropic/claude-opus-5", provider: "orcarouter", label: "Claude Opus 5", desc: "Most capable" },
  { id: "anthropic/claude-opus-4.8", provider: "orcarouter", label: "Claude Opus 4.8", desc: "Deep reasoning" },
  { id: "anthropic/claude-opus-4", provider: "orcarouter", label: "Claude Opus 4", desc: "Top-tier reasoning" },
  { id: "anthropic/claude-sonnet-4.5", provider: "orcarouter", label: "Claude Sonnet 4.5", desc: "Latest sonnet" },
  { id: "anthropic/claude-sonnet-4", provider: "orcarouter", label: "Claude Sonnet 4", desc: "Balanced" },
  { id: "anthropic/claude-3.5-haiku", provider: "orcarouter", label: "Claude 3.5 Haiku", desc: "Fast & cheap" },
  { id: "openai/gpt-4o", provider: "orcarouter", label: "GPT-4o", desc: "OpenAI flagship" },
  { id: "openai/gpt-4o-mini", provider: "orcarouter", label: "GPT-4o Mini", desc: "Cheap & fast" },
  { id: "openai/gpt-4.1", provider: "orcarouter", label: "GPT-4.1", desc: "Latest GPT" },
  { id: "openai/o3-mini", provider: "orcarouter", label: "o3-mini", desc: "Reasoning mini" },
  { id: "openai/o4-mini", provider: "orcarouter", label: "o4-mini", desc: "Reasoning v4 mini" },
  { id: "grok/grok-4.5", provider: "orcarouter", label: "Grok 4.5", desc: "xAI latest" },
  { id: "grok/grok-3", provider: "orcarouter", label: "Grok 3", desc: "xAI flagship" },
  { id: "grok/grok-3-mini", provider: "orcarouter", label: "Grok 3 Mini", desc: "Compact Grok" },
  { id: "deepseek/deepseek-chat", provider: "orcarouter", label: "DeepSeek Chat", desc: "Fast & capable" },
  { id: "deepseek/deepseek-v3", provider: "orcarouter", label: "DeepSeek V3", desc: "DeepSeek flagship" },
  { id: "deepseek/deepseek-reasoner", provider: "orcarouter", label: "DeepSeek Reasoner", desc: "Reasoning model" },
  { id: "meta-llama/llama-4-maverick", provider: "orcarouter", label: "Llama 4 Maverick", desc: "Latest Llama" },
  { id: "z-ai/glm-5.2", provider: "orcarouter", label: "GLM 5.2", desc: "Latest GLM" },
  { id: "kimi/kimi-k3", provider: "orcarouter", label: "Kimi K3", desc: "Moonshot latest" },
  { id: "kimi/kimi-k2.6", provider: "orcarouter", label: "Kimi K2.6", desc: "Long context" },
  { id: "minimax/minimax-m3", provider: "orcarouter", label: "MiniMax M3", desc: "Fast & smart" },
  { id: "orcarouter/auto", provider: "orcarouter", label: "OrcaRouter Auto", desc: "Auto-pick cheapest" },
]

export const CLOUD_MODELS = ALL_MODELS.filter((m) => m.provider === "supercode")
export const BYOK_MODELS = ALL_MODELS.filter((m) => m.provider !== "supercode")
export const BYOK_PROVIDERS = HARNESS_PROVIDERS.filter((p) => !p.isCloud)
export const NOVA_MODELS = CLOUD_MODELS

export const DEFAULT_NOVA_PROVIDER: HarnessProvider = "supercode"
export const DEFAULT_NOVA_MODEL = CLOUD_MODELS[0]!.id

export type NovaEffort = "low" | "medium" | "high" | "xhigh"
export const NOVA_EFFORTS: Array<{ id: NovaEffort; label: string }> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "xhigh", label: "Extra high" },
]

export type NovaAgentMode = "agent" | "plan" | "chat"
export const NOVA_AGENT_MODES: Array<{ id: NovaAgentMode; label: string }> = [
  { id: "agent", label: "Agent" },
  { id: "plan", label: "Plan" },
  { id: "chat", label: "Chat" },
]

export function menuId(entry: NovaModelEntry) { return `${entry.provider}::${entry.id}` }
export function findModel(provider: string, model: string) {
  return ALL_MODELS.find((e) => e.provider === provider && e.id === model)
}
export function modelsForProvider(provider: HarnessProvider) {
  return ALL_MODELS.filter((e) => e.provider === provider)
}
export function modelChipLabel(provider: string, model: string) {
  const entry = findModel(provider, model)
  if (!entry) return model
  if (entry.provider === "supercode") return entry.label
  const meta = HARNESS_PROVIDERS.find((p) => p.id === entry.provider)
  return `${meta?.shortLabel ?? entry.provider} · ${entry.label}`
}
export function modelLabel(id: string) {
  return ALL_MODELS.find((m) => m.id === id)?.label ?? id
}
export function resolveHarnessSelection(modelId?: string | null, providerId?: string | null) {
  if (providerId && modelId) {
    const exact = findModel(providerId, modelId)
    if (exact) return { provider: exact.provider, model: exact.id }
  }
  if (modelId?.trim()) {
    const byId = ALL_MODELS.find((e) => e.id === modelId.trim())
    if (byId) return { provider: byId.provider, model: byId.id }
    return { provider: (providerId as HarnessProvider) || DEFAULT_NOVA_PROVIDER, model: modelId.trim() }
  }
  return { provider: DEFAULT_NOVA_PROVIDER, model: DEFAULT_NOVA_MODEL }
}

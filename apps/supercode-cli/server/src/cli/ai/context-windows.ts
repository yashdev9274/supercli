const CONTEXT_WINDOWS: Record<string, number> = {
  "minimax/minimax-m3": 1_048_576,
  "z-ai/glm-5.1": 203_000,
  "moonshotai/kimi-k2.6": 262_144,
  "minimax/minimax-m3.5": 1_000_000,
  "minimax/minimax-m2.5": 1_000_000,
  "openai/gpt-oss-120b:free": 128_000,
  "deepseek/deepseek-v4-flash": 128_000,
  "deepseek-ai/deepseek-v4-flash": 128_000,
  "meta/llama-3.3-70b-instruct": 128_000,
  "gemini-2.5-flash": 1_048_576,
  "gemini-2.5-pro": 1_048_576,
  "MiniMax-M2": 1_000_000,
  "minimaxai/minimax-m3": 1_000_000,
  "deepseek-v4-flash": 128_000,
  "kimi-k2-6": 262_144,
  "glm-5.2": 203_000,
  "glm-5.1": 203_000,
  "minimax-m3": 1_000_000,
  "anthropic/claude-fable-5": 1_000_000,
  "anthropic/claude-opus-4-8": 1_000_000,
  "anthropic/claude-opus-4-7": 1_000_000,
}

const FALLBACK_CONTEXT_WINDOW = 128_000

export function getContextWindow(modelName: string): number {
  const direct = CONTEXT_WINDOWS[modelName]
  if (direct != null) return direct
  for (const [key, value] of Object.entries(CONTEXT_WINDOWS)) {
    if (modelName.includes(key) || key.includes(modelName)) return value
  }
  for (const key of Object.keys(CONTEXT_WINDOWS)) {
    const keyParts = key.split("/").pop()
    if (keyParts && modelName.includes(keyParts)) {
      const val = CONTEXT_WINDOWS[key]
      if (val != null) return val
    }
  }
  return FALLBACK_CONTEXT_WINDOW
}

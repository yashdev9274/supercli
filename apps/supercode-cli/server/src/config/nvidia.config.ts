

export function getNvidiaApiKey(): string {
  return process.env.NVIDIA_BYOK_PROD_KEY
    || process.env.NVIDIA_BYOK_DEV_KEY
    || process.env.NVIDIA_API_KEY
    || ""
}

export const nvidiaConfig = {
  get apiKey() { return getNvidiaApiKey() },
  get model() { return process.env.NVIDIA_MODEL || "minimaxai/minimax-m3" },
  get baseUrl() { return process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1" },
  get maxTokens() { return Number(process.env.NVIDIA_MAX_TOKENS) || 8192 },
  get temperature() { return Number(process.env.NVIDIA_TEMPERATURE) || 1 },
  get topP() { return Number(process.env.NVIDIA_TOP_P) || 0.95 },
}



export const nvidiaConfig = {
  apiKey: process.env.NVIDIA_API_KEY || "",
  model: process.env.NVIDIA_MODEL || "minimaxai/minimax-m2.7",
  baseUrl: process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1",
  maxTokens: Number(process.env.NVIDIA_MAX_TOKENS) || 8192,
  temperature: Number(process.env.NVIDIA_TEMPERATURE) || 1,
  topP: Number(process.env.NVIDIA_TOP_P) || 0.95,
}

import { select, isCancel } from "@clack/prompts"
import chalk from "chalk"
import { theme } from "src/cli/utils/tui.ts"
import { createProvider, type ModelProvider } from "src/cli/ai/provider.ts"

const openRouterModels = {
  "openai/gpt-oss-120b:free": "GPT OSS 120B (free)",
  "deepseek/deepseek-v4-flash": "DeepSeek V4 Flash",
  "minimax/minimax-m3": "MiniMax M3",
  "z-ai/glm-5.1": "GLM 5.1",
  "moonshotai/kimi-k2.6:free": "Kimi K2.6 (free)",
} as const

const nvidiaModels = {
  "minimaxai/minimax-m2.7": "MiniMax M2.7",
  "deepseek-ai/deepseek-v4-flash": "DeepSeek V4 Flash",
  "meta/llama-3.3-70b-instruct": "Llama 3.3 70B",
} as const

const googleModels = {
  "gemini-2.5-flash": "Gemini 2.5 Flash",
  "gemini-2.5-pro": "Gemini 2.5 Pro",
} as const

function defaultModel(provider: ModelProvider): string | undefined {
  if (provider === "google") return "gemini-2.5-flash"
  if (provider === "openrouter") return "openai/gpt-oss-120b:free"
  if (provider === "nvidia") return "minimaxai/minimax-m2.7"
  return undefined
}

export async function pickModel(): Promise<{ provider: ModelProvider; model?: string }> {
  const providerChoice = await select({
    message: chalk.hex(theme.cyan)("switch model"),
    options: [
      { value: "google", label: "Google Gemini", hint: "default" },
      { value: "openrouter", label: "OpenRouter", hint: "multi-provider" },
      { value: "nvidia", label: "NVIDIA NIM", hint: "free tier" },
    ],
  })

  if (isCancel(providerChoice)) {
    return { provider: "google", model: "gemini-2.5-flash" }
  }

  if (providerChoice === "google") {
    const model = await select({
      message: chalk.hex(theme.cyan)("select Gemini model"),
      options: Object.entries(googleModels).map(([value, label]) => ({ value, label })),
    })
    if (isCancel(model)) return { provider: "google", model: defaultModel("google") }
    return { provider: "google", model: model as string }
  }

  if (providerChoice === "openrouter") {
    const model = await select({
      message: chalk.hex(theme.cyan)("select OpenRouter model"),
      options: Object.entries(openRouterModels).map(([value, label]) => ({ value, label })),
    })
    if (isCancel(model)) return { provider: "openrouter", model: defaultModel("openrouter") }
    return { provider: "openrouter", model: model as string }
  }

  if (providerChoice === "nvidia") {
    const model = await select({
      message: chalk.hex(theme.cyan)("select NVIDIA NIM model"),
      options: Object.entries(nvidiaModels).map(([value, label]) => ({ value, label })),
    })
    if (isCancel(model)) return { provider: "nvidia", model: defaultModel("nvidia") }
    return { provider: "nvidia", model: model as string }
  }

  return { provider: providerChoice as ModelProvider }
}

export function formatModelChange(p: ModelProvider, m?: string): string {
  const label = p === "google" ? "Gemini" : p === "nvidia" ? "NVIDIA" : "OpenRouter"
  return `${label}${m ? ` · ${m}` : ""}`
}

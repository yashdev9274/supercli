import { select, isCancel } from "@clack/prompts"
import chalk from "chalk"
import { theme, heavyDivider } from "src/cli/utils/tui.ts"
import { createProvider, type ModelProvider } from "src/cli/ai/provider.ts"

function defaultModel(provider: ModelProvider): string | undefined {
  if (provider === "google") return "gemini-2.5-flash"
  if (provider === "openrouter") return "openai/gpt-oss-120b:free"
  if (provider === "nvidia") return "minimaxai/minimax-m2.7"
  return undefined
}

const PROVIDER_DISPLAY: Record<string, { name: string; models: Array<{ value: string; label: string; desc: string }> }> = {
  google: {
    name: "Google Gemini",
    models: [
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", desc: "Smart & fast · multimodal" },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", desc: "Smartest · deep reasoning" },
    ],
  },
  openrouter: {
    name: "OpenRouter",
    models: [
      { value: "openai/gpt-oss-120b:free", label: "GPT OSS 120B", desc: "Free · OpenAI open-weight" },
      { value: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", desc: "Smart · collects data for training" },
      { value: "minimax/minimax-m3", label: "MiniMax M3", desc: "Smartest & fastest" },
      { value: "z-ai/glm-5.1", label: "GLM 5.1", desc: "Balanced multilingual" },
      { value: "moonshotai/kimi-k2.6:free", label: "Kimi K2.6", desc: "Free · long context" },
    ],
  },
  nvidia: {
    name: "NVIDIA NIM",
    models: [
      { value: "minimaxai/minimax-m2.7", label: "MiniMax M2.7", desc: "Smartest & fast" },
      { value: "deepseek-ai/deepseek-v4-flash", label: "DeepSeek V4 Flash", desc: "Smart · collects data for training" },
      { value: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B", desc: "Open weights · long context" },
    ],
  },
}

function renderProviderList(providers: Record<string, { name: string; models: Array<{ value: string; label: string; desc: string }> }>): void {
  const divider = heavyDivider()
  process.stdout.write(`\r\n${divider}\r\n`)
  for (const [key, p] of Object.entries(providers)) {
    process.stdout.write(` ${chalk.hex(theme.cyan)(p.name)}\r\n`)
    for (const m of p.models) {
      process.stdout.write(`   ${chalk.hex(theme.greenGlow)(m.label.padEnd(28))}${chalk.hex(theme.muted)(m.desc)}\r\n`)
    }
  }
  process.stdout.write(`${divider}\r\n`)
}

export async function pickModel(): Promise<{ provider: ModelProvider; model?: string }> {
  console.log()
  console.log(heavyDivider())
  console.log()

  renderProviderList(PROVIDER_DISPLAY)
  console.log()

  const providerChoice = await select({
    message: chalk.hex(theme.green)("switch model"),
    options: [
      { value: "google", label: "Google Gemini", hint: "default" },
      { value: "openrouter", label: "OpenRouter", hint: "multi-provider" },
      { value: "nvidia", label: "NVIDIA NIM", hint: "free tier" },
    ],
  })

  if (isCancel(providerChoice)) {
    return { provider: "google", model: "gemini-2.5-flash" }
  }

  const provider = PROVIDER_DISPLAY[providerChoice as string]
  if (!provider) return { provider: providerChoice as ModelProvider }

  console.log()
  const model = await select({
    message: chalk.hex(theme.green)(`select ${provider.name} model`),
    options: provider.models.map((m) => ({ value: m.value, label: m.label, hint: m.desc })),
  })
  if (isCancel(model)) return { provider: providerChoice as ModelProvider, model: provider.models[0]?.value ?? defaultModel(providerChoice as ModelProvider) }
  return { provider: providerChoice as ModelProvider, model: model as string }
}

export function formatModelChange(p: ModelProvider, m?: string): string {
  const label = p === "google" ? "Gemini" : p === "nvidia" ? "NVIDIA" : "OpenRouter"
  return `${label}${m ? ` · ${m}` : ""}`
}
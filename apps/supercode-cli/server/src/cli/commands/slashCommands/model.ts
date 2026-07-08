import { select, isCancel, confirm } from "@clack/prompts"
import chalk from "chalk"
import { theme, sectionHeader } from "src/cli/utils/tui.ts"
import type { ModelProvider } from "src/cli/ai/provider.ts"
import { getCliConfig, saveCliConfig } from "src/lib/cli-config.ts"

interface ModelEntry {
  value: string
  label: string
  provider: ModelProvider
  cost: string
  desc: string
}

const MODELS: ModelEntry[] = [
  { value: "anthropic/claude-fable-5", label: "Fable 5", provider: "concentrateai", cost: "80x", desc: "Anthropic frontier" },
  { value: "anthropic/claude-opus-4-8", label: "Opus 4.8", provider: "concentrateai", cost: "40x", desc: "Anthropic reasoning" },
  { value: "anthropic/claude-opus-4-7", label: "Opus 4.7", provider: "concentrateai", cost: "40x", desc: "Anthropic GA" },
  { value: "glm-5.2", label: "GLM 5.2", provider: "concentrateai", cost: "0.5x", desc: "Latest GLM" },
  // { value: "glm-5.1", label: "GLM 5.1", provider: "concentrateai", cost: "0.4x", desc: "Balanced multilingual" },
  { value: "kimi-k2-6", label: "Kimi K2.6", provider: "concentrateai", cost: "0.8x", desc: "Long context" },
  { value: "deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "concentrateai", cost: "1.0x", desc: "Fast & capable" },
  { value: "minimax-m3", label: "MiniMax M3", provider: "concentrateai", cost: "0.5x", desc: "Fast & smart" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "google", cost: "2.0x", desc: "Smart & fast" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "google", cost: "4.0x", desc: "Deep reasoning" },
  { value: "minimaxai/minimax-m3", label: "MiniMax M3", provider: "nvidia", cost: "0.5x", desc: "Via NVIDIA NIM" },
  { value: "deepseek-ai/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "nvidia", cost: "1.0x", desc: "Via NVIDIA NIM" },
  { value: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "nvidia", cost: "1.2x", desc: "Open weights" },
  { value: "openai/gpt-oss-120b:free", label: "GPT OSS 120B", provider: "openrouter", cost: "free", desc: "OpenAI open-weight" },
  { value: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "openrouter", cost: "1.2x", desc: "Via OpenRouter" },
  { value: "minimax/minimax-m3", label: "MiniMax M3", provider: "openrouter", cost: "3.0x", desc: "Via OpenRouter" },
  { value: "z-ai/glm-5.1", label: "GLM 5.1", provider: "openrouter", cost: "1.0x", desc: "Via OpenRouter" },
  { value: "moonshotai/kimi-k2.6", label: "Kimi K2.6", provider: "openrouter", cost: "1.5x", desc: "Via OpenRouter" },
]

function renderModelBrowser(currentProvider: string, currentModel: string): void {
  const w = Math.min(process.stdout.columns ?? 80, 72)

  console.log(`  ${chalk.hex(theme.greenGlow).bold("Select Model For This Session")}`)
  console.log(`  ${chalk.hex(theme.muted)("Multipliers represent cost in Standard Tokens")}`)
  console.log()

  const grouped: Record<string, ModelEntry[]> = {}
  for (const m of MODELS) {
    if (!grouped[m.provider]) grouped[m.provider] = []
    grouped[m.provider]!.push(m)
  }

  for (const [providerKey, models] of Object.entries(grouped)) {
    const isDefault = providerKey === "concentrateai"
    const label = isDefault
      ? "ConcentrateAI (default)"
      : providerKey === "google" ? "Google Gemini"
      : providerKey === "openrouter" ? "OpenRouter"
      : "NVIDIA NIM"
    console.log(`  ${sectionHeader(label, { accent: isDefault ? "amber" : "green", width: w - 4 })}`)
    for (const m of models) {
      const isCurrent = providerKey === currentProvider && m.value === currentModel
      const prefix = isCurrent ? chalk.hex(theme.amber)("❯") : " "
      const name = chalk.hex(isCurrent ? theme.green : theme.greenGlow)(m.label.padEnd(22))
      const cost = chalk.hex(m.cost === "free" ? theme.greenGlow : theme.muted)(m.cost.padEnd(6))
      const desc = chalk.hex(theme.muted)(m.desc.padEnd(20))
      const marker = isCurrent ? ` ${chalk.bgHex(theme.amber).hex(theme.black).bold(" current ")}` : ""
      const freeTag = !isCurrent && providerKey === "concentrateai" ? ` ${chalk.bgHex(theme.green).hex(theme.black).bold(" FREE ")}` : ""
      console.log(`  ${prefix} ${name} ${cost}${desc}${marker}${freeTag}`)
    }
    console.log()
  }
}

export async function pickModel(): Promise<{ provider: ModelProvider; model?: string }> {
  const stored = await getCliConfig()
  const currentProvider = stored?.provider || "concentrateai"
  const currentModel = stored?.model || "glm-5.1"

  renderModelBrowser(currentProvider, currentModel)

  const flatOptions: { value: string; label: string; hint?: string }[] = MODELS.map(m => {
    const isCurrent = m.provider === currentProvider && m.value === currentModel
    const label = m.provider === "concentrateai"
      ? `${m.label} (${m.cost})`
      : `${m.label} (${m.cost}) · ${m.provider}`
    const hint = isCurrent ? `[current] ${m.desc}` : m.desc
    return { value: `${m.provider}:${m.value}`, label, hint }
  })

  flatOptions.push({
    value: "__cancel",
    label: "Cancel — keep current selection",
    hint: `${currentProvider} · ${currentModel}`,
  })

  const modelChoice = await select({
    message: chalk.hex(theme.green)("switch model"),
    options: flatOptions,
  })

  if (isCancel(modelChoice) || modelChoice === "__cancel") {
    return { provider: currentProvider as ModelProvider, model: currentModel }
  }

  const choice = modelChoice as string
  const [provider, ...modelParts] = choice.split(":")
  const model = modelParts.join(":")

  console.log()
  const setAsDefault = await confirm({
    message: chalk.hex(theme.greenMute)("Set as default for new sessions?"),
    initialValue: false,
  })

  if (!isCancel(setAsDefault) && setAsDefault) {
    const newConfig = await saveCliConfig({ provider: provider as ModelProvider, model })
    const label = formatModelChange(provider as ModelProvider, model)
    console.log(`  ${chalk.hex(theme.green)("◆")} saved default: ${chalk.hex(theme.greenGlow)(label)}\n`)
  }

  return { provider: provider as ModelProvider, model }
}

export function formatModelChange(p: ModelProvider, m?: string): string {
  const label = p === "concentrateai" ? "ConcentrateAI" :
    p === "google" ? "Gemini" :
    p === "nvidia" ? "NVIDIA" : p === "minimax" ? "MiniMax" : "OpenRouter"
  return `${label}${m ? ` · ${m}` : ""}`
}

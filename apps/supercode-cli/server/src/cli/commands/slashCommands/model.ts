import { select, isCancel } from "@clack/prompts"
import chalk from "chalk"
import { theme, sectionHeader, cardStack, cardRow, rowCard, heavyDivider } from "src/cli/utils/tui.ts"
import { createProvider, type ModelProvider } from "src/cli/ai/provider.ts"

const openRouterModels: Array<{ value: string; label: string; description: string; badge?: "recommended" }> = [
  { value: "openai/gpt-oss-120b:free", label: "GPT OSS 120B", description: "Free · OpenAI open-weight", badge: "recommended" },
  { value: "minimax/minimax-m3", label: "MiniMax M3", description: "Smartest & fastest" },
  { value: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", description: "Smart · collects data for training" },
  { value: "z-ai/glm-5.1", label: "GLM 5.1", description: "Balanced multilingual" },
  { value: "moonshotai/kimi-k2.6:free", label: "Kimi K2.6", description: "Free · long context" },
]

const nvidiaModels: Array<{ value: string; label: string; description: string; badge?: "recommended" }> = [
  { value: "minimaxai/minimax-m2.7", label: "MiniMax M2.7", description: "Smartest & fast", badge: "recommended" },
  { value: "deepseek-ai/deepseek-v4-flash", label: "DeepSeek V4 Flash", description: "Smart · collects data for training" },
  { value: "meta/llama-3.3-70b-instruct", label: "Llama 3.3 70B", description: "Open weights · long context" },
]

const googleModels: Array<{ value: string; label: string; description: string; badge?: "recommended" }> = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", description: "Smart & fast · multimodal", badge: "recommended" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", description: "Smartest · deep reasoning" },
]

function defaultModel(provider: ModelProvider): string | undefined {
  if (provider === "google") return "gemini-2.5-flash"
  if (provider === "openrouter") return "openai/gpt-oss-120b:free"
  if (provider === "nvidia") return "minimaxai/minimax-m2.7"
  return undefined
}

function renderModelPicker(rows: Array<{ value: string; label: string; description: string; badge?: "recommended" }>, title: string): string {
  const cards = rows.map((m) =>
    cardRow({
      label: m.label,
      description: m.description,
      selected: false,
      badge: m.badge,
    }),
  )
  return cardStack({ title, rows: cards })
}

export async function pickModel(): Promise<{ provider: ModelProvider; model?: string }> {
  console.log()
  console.log(heavyDivider())
  console.log()

  // ── Show the three providers as a card stack ────────────────
  const providerRows = [
    rowCard({ label: "Google Gemini", description: "default · fast + multimodal", selected: true }),
    rowCard({ label: "OpenRouter", description: "multi-provider routing" }),
    rowCard({ label: "NVIDIA NIM", description: "free tier · open weights" }),
  ]
  console.log(cardStack({ title: "provider", rows: providerRows }))
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

  if (providerChoice === "google") {
    console.log()
    console.log(sectionHeader("models", { accent: "green" }))
    console.log()
    console.log(renderModelPicker(googleModels, "google"))
    console.log()
    const model = await select({
      message: chalk.hex(theme.green)("select gemini model"),
      options: googleModels.map((m) => ({ value: m.value, label: m.label, hint: m.description })),
    })
    if (isCancel(model)) return { provider: "google", model: defaultModel("google") }
    return { provider: "google", model: model as string }
  }

  if (providerChoice === "openrouter") {
    console.log()
    console.log(sectionHeader("models", { accent: "green" }))
    console.log()
    console.log(renderModelPicker(openRouterModels, "openrouter"))
    console.log()
    const model = await select({
      message: chalk.hex(theme.green)("select openrouter model"),
      options: openRouterModels.map((m) => ({ value: m.value, label: m.label, hint: m.description })),
    })
    if (isCancel(model)) return { provider: "openrouter", model: defaultModel("openrouter") }
    return { provider: "openrouter", model: model as string }
  }

  if (providerChoice === "nvidia") {
    console.log()
    console.log(sectionHeader("models", { accent: "green" }))
    console.log()
    console.log(renderModelPicker(nvidiaModels, "nvidia"))
    console.log()
    const model = await select({
      message: chalk.hex(theme.green)("select nvidia model"),
      options: nvidiaModels.map((m) => ({ value: m.value, label: m.label, hint: m.description })),
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
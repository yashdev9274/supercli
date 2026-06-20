import chalk from "chalk"
import { theme, cardStack, cardRow, heavyDivider, sectionHeader } from "src/cli/utils/tui.ts"

const COMMANDS = [
  { cmd: "/model", desc: "Switch AI provider or model" },
  { cmd: "/connect", desc: "Connect API key for direct access" },
  { cmd: "/help", desc: "Show this help screen" },
  { cmd: "/exit", desc: "End the session" },
]

const PROVIDERS = [
  { name: "Google Gemini", models: ["gemini-2.5-flash", "gemini-2.5-pro"], note: "free · multimodal" },
  { name: "OpenRouter", models: ["openai/gpt-oss-120b:free", "deepseek/deepseek-v4-flash", "minimax/minimax-m3", "z-ai/glm-5.1", "moonshotai/kimi-k2.6:free"], note: "bring your own key" },
  { name: "NVIDIA NIM", models: ["minimaxai/minimax-m2.7", "deepseek-ai/deepseek-v4-flash", "meta/llama-3.3-70b-instruct"], note: "free API" },
]

function renderCommands(): string {
  const rows = COMMANDS.map((c) =>
    cardRow({ label: c.cmd, description: c.desc, selected: false })
  )
  return cardStack({ title: "commands", rows })
}

function renderProviders(): string {
  const rows = PROVIDERS.map((p) =>
    cardRow({
      label: p.name,
      description: `${p.models.join(", ")}`,
      selected: false,
      badge: p.note as any,
    })
  )
  return cardStack({ title: "providers & models", rows })
}

export function renderHelp(): void {
  console.log()
  console.log(heavyDivider())
  console.log()
  console.log(sectionHeader("supercode help", { accent: "green" }))
  console.log()
  console.log(renderCommands())
  console.log()
  console.log(renderProviders())
  console.log()
  console.log(heavyDivider())
  console.log()
}

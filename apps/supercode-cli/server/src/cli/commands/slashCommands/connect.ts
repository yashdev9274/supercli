import { select, isCancel, password, note } from "@clack/prompts"
import chalk from "chalk"
import { theme } from "src/cli/utils/tui.ts"
import { saveProviderApiKey } from "src/lib/cli-config.ts"
import type { ModelProvider } from "src/cli/ai/provider.ts"

const PROVIDERS: Array<{ value: ModelProvider; label: string; hint: string; link: string }> = [
  { value: "google", label: "Google Gemini", hint: "gemini-2.5 models", link: "https://aistudio.google.com/apikey" },
  { value: "openrouter", label: "OpenRouter", hint: "multi-provider access", link: "https://openrouter.ai/keys" },
  { value: "nvidia", label: "NVIDIA NIM", hint: "free NVIDIA hosted models", link: "https://build.nvidia.com/explore/discover" },
]

export async function connectProvider(): Promise<{ type: "connect"; provider?: ModelProvider }> {
  console.log()
  console.log(` ${chalk.hex(theme.amber)("◆")}  ${chalk.hex(theme.green).bold("connect API key")}`)
  console.log(` ${chalk.hex(theme.muted)("Save an API key so requests go direct instead of through the proxy.")}`)
  console.log()

  const providerChoice = await select({
    message: chalk.hex(theme.green)("select provider"),
    options: PROVIDERS.map((p) => ({
      value: p.value,
      label: p.label,
      hint: p.hint,
    })),
  })

  if (isCancel(providerChoice)) return { type: "connect" }

  const provider = PROVIDERS.find((p) => p.value === providerChoice)!

  note(chalk.hex(theme.muted)(`Get your key at: ${provider.link}`), `${provider.label}`)

  const apiKey = await password({
    message: chalk.hex(theme.green)(`paste your ${provider.label} API key`),
    validate: (val: string | undefined) => {
      if (!val || val.trim().length < 8) return "Key looks too short — please check and try again"
    },
  })

  if (isCancel(apiKey)) return { type: "connect" }

  await saveProviderApiKey(provider.value, apiKey as string)

  console.log(` ${chalk.hex(theme.green)("✓")} ${chalk.hex(theme.green)(`${provider.label} API key saved`)}`)
  console.log()

  return { type: "connect", provider: provider.value }
}

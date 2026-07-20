import { select, isCancel, password, note, text } from "@clack/prompts"
import chalk from "chalk"
import { theme } from "src/cli/utils/tui.ts"
import {
  getCliConfig,
  saveProviderApiKey,
  getByokSessionKey,
} from "src/lib/cli-config.ts"
import type { ModelProvider } from "src/cli/ai/provider.ts"
import { BYOK_MODELS, ALL_SECTIONS } from "./model.ts"

const PROVIDERS: Array<{ value: ModelProvider; label: string; hint: string; link: string }> = [
  { value: "concentrateai", label: "ConcentrateAI", hint: "deepseek-v4 & glm models", link: "https://concentrate.ai" },
  { value: "mergedev", label: "Merge Dev Gateway", hint: "unified API gateway", link: "https://app.merge.dev" },
  { value: "google", label: "Google Gemini", hint: "gemini-2.5 models", link: "https://aistudio.google.com/apikey" },
  { value: "openrouter", label: "OpenRouter", hint: "multi-provider access", link: "https://openrouter.ai/keys" },
  { value: "nvidia", label: "NVIDIA NIM", hint: "free NVIDIA hosted models", link: "https://build.nvidia.com/explore/discover" },
  { value: "orcarouter", label: "OrcaRouter", hint: "multi-provider router", link: "https://orcarouter.ai" },
  { value: "minimax", label: "MiniMax", hint: "fast & smart models", link: "https://platform.minimax.ai" },
]

export async function connectProvider(): Promise<{ type: "connect"; provider?: ModelProvider; model?: string }> {
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

  // Check if user already has a BYOK key for this session
  const config = await getCliConfig()
  const existingKey = config?.apiKeys?.[provider.value] || getByokSessionKey(provider.value)

  if (existingKey) {
    console.log(` ${chalk.hex(theme.green)("✓")} ${chalk.hex(theme.green)(`Already have a key for ${provider.label} — switching to direct mode (🔑)`)}`)
    console.log()
  } else {
    note(chalk.hex(theme.muted)(`Get your key at: ${provider.link}`), `${provider.label}`)

    const apiKey = await password({
      message: chalk.hex(theme.green)(`paste your ${provider.label} API key`),
      validate: (val: string | undefined) => {
        if (!val || val.trim().length < 8) return "Key looks too short — please check and try again"
      },
    })

    if (isCancel(apiKey)) return { type: "connect" }

    await saveProviderApiKey(provider.value, apiKey as string)

    console.log(` ${chalk.hex(theme.green)("✓")} ${chalk.hex(theme.green)(`${provider.label} API key saved — requests will now go direct (🔑) instead of through the proxy (☁️)`)}`)
    console.log()
  }

  // Model selection via @clack — safe with the chat loop's stdin management
  const modelsForProvider = BYOK_MODELS.filter((m) => m.provider === provider.value && !ALL_SECTIONS.has(m.value))
  let chosenModel: string | undefined

  if (modelsForProvider.length > 0) {
    const modelChoice = await select({
      message: chalk.hex(theme.green)("select model"),
      options: modelsForProvider.map((m) => ({
        value: m.value,
        label: `${m.label}  ${chalk.hex(theme.muted)(m.desc)}`,
        hint: m.cost ? `${m.cost}x` : "",
      })),
    })
    if (isCancel(modelChoice)) {
      // No model selected
    } else {
      chosenModel = modelChoice as string
    }
    if (chosenModel) {
      const label = modelsForProvider.find((m) => m.value === modelChoice)?.label || chosenModel
      console.log(` ${chalk.hex(theme.green)("✓")} model set to ${chalk.hex(theme.greenGlow)(label)}`)
      console.log()
    }
  } else {
    const customName = await text({
      message: chalk.hex(theme.green)(`enter model name for ${provider.label}`),
      placeholder: "e.g. claude-sonnet-4",
    })
    if (!isCancel(customName) && (customName as string).trim()) {
      chosenModel = (customName as string).trim()
      console.log(` ${chalk.hex(theme.green)("✓")} model set to ${chalk.hex(theme.greenGlow)(chosenModel)}`)
      console.log()
    }
  }

  return { type: "connect", provider: provider.value, model: chosenModel }
}

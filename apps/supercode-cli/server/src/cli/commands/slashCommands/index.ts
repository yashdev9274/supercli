import { pickModel, formatModelChange } from "./model.ts"
import type { ModelProvider } from "src/cli/ai/provider.ts"

export interface SlashCommandResult {
  type: "model_change" | "unknown"
  provider?: ModelProvider
  model?: string
  label?: string
}

const handlers: Record<string, (args: string) => Promise<SlashCommandResult>> = {
  model: async () => {
    const result = await pickModel()
    return {
      type: "model_change",
      provider: result.provider,
      model: result.model,
      label: formatModelChange(result.provider, result.model),
    }
  },
}

export async function handleSlashCommand(input: string): Promise<SlashCommandResult | null> {
  const match = input.match(/^\/(\w+)\s*(.*)$/)
  if (!match) return null

  const [, cmd = "", args = ""] = match


  const handler = handlers[cmd.toLowerCase()]
  if (!handler) return { type: "unknown" }

  return handler(args.trim())
}

export function isSlashCommand(input: string): boolean {
  return /^\//.test(input.trim())
}

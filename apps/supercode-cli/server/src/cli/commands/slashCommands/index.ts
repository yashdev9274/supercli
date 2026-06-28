import { select, isCancel } from "@clack/prompts"
import chalk from "chalk"
import { pickModel, formatModelChange } from "./model.ts"
import { connectProvider } from "./connect.ts"
import { renderHelp } from "./help.ts"
import { theme, heavyDivider } from "src/cli/utils/tui.ts"
import type { ModelProvider } from "src/cli/ai/provider.ts"

export interface SlashCommandResult {
  type: "model_change" | "help" | "unknown" | "exit" | "connect" | "context"
  provider?: ModelProvider
  model?: string
  label?: string
}

const COMMANDS = [
  { cmd: "/model", desc: "Switch AI provider or model" },
  { cmd: "/connect", desc: "Connect API key for direct access" },
  { cmd: "/context", desc: "Show context window usage and breakdown" },
  { cmd: "/help", desc: "Show available commands and models" },
  { cmd: "/exit", desc: "End the session" },
]

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
  connect: async () => {
    return connectProvider()
  },
  help: async () => {
    renderHelp()
    return { type: "help" }
  },
  context: async () => {
    return { type: "context" }
  },
}

function renderCommandList(): void {
  const divider = heavyDivider()
  process.stdout.write(`\r\n${divider}\r\n`)
  process.stdout.write(` ${chalk.hex(theme.amber)("❯")} /\r\n`)
  process.stdout.write(`${divider}\r\n`)
  for (const c of COMMANDS) {
    process.stdout.write(` ${chalk.hex(theme.green)(c.cmd.padEnd(24))}${chalk.hex(theme.muted)(c.desc)}\r\n`)
  }
  process.stdout.write(`${divider}\r\n`)
}

export async function handleSlashCommand(input: string): Promise<SlashCommandResult | null> {
  const match = input.match(/^\/(\w+)\s*(.*)$/)
  if (!match) return null

  const [, cmd = "", args = ""] = match

  if (!cmd) {
    renderCommandList()
    return { type: "help" }
  }

  if (cmd.toLowerCase() === "exit") {
    return { type: "exit" }
  }

  const handler = handlers[cmd.toLowerCase()]
  if (!handler) return { type: "unknown" }

  return handler(args.trim())
}

export function isSlashCommand(input: string): boolean {
  return /^\//.test(input.trim())
}

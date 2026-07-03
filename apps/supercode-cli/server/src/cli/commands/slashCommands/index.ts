import { select, isCancel } from "@clack/prompts"
import chalk from "chalk"
import { pickModel, formatModelChange } from "./model.ts"
import { connectProvider } from "./connect.ts"
import { renderHelp } from "./help.ts"
import { searchSlash, scrapeSlash, interactSlash, crawlSlash, parseSlash } from "./firecrawl.ts"
import { theme, heavyDivider } from "src/cli/utils/tui.ts"
import type { ModelProvider } from "src/cli/ai/provider.ts"

export interface SlashCommandResult {
  type: "model_change" | "help" | "unknown" | "exit" | "connect" | "context" | "compact" | "plan" | "scratch" | "voice" | "verbose"
  provider?: ModelProvider
  model?: string
  label?: string
}

export const COMMANDS = [
  { cmd: "/model", desc: "Switch AI provider or model" },
  { cmd: "/connect", desc: "Connect API key for direct access" },
  { cmd: "/context", desc: "Show context window usage and breakdown" },
  { cmd: "/compact", desc: "Compress conversation history (uses the compaction agent)" },
  { cmd: "/plan", desc: "Switch to plan mode (read-only)" },
  { cmd: "/scratch", desc: "List/show/delete subagent artifacts in .super/scratch/" },
  { cmd: "/voice", desc: "Capture voice input via microphone" },
  { cmd: "/verbose", desc: "Toggle live tool call debug logs" },
  { cmd: "/search", desc: "Search the web via Firecrawl" },
  { cmd: "/scrape", desc: "Scrape a URL via Firecrawl" },
  { cmd: "/interact", desc: "Browser interaction via Firecrawl" },
  { cmd: "/crawl", desc: "Crawl a website via Firecrawl" },
  { cmd: "/parse", desc: "Parse a file (PDF, DOC, etc.) via Firecrawl" },
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
  compact: async () => {
    return { type: "compact" }
  },
  plan: async (args: string) => {
    const { planCommand } = await import("./plan.ts")
    // Conversation ID is threaded in via handleSlashCommand's outer scope.
    return planCommand(args, currentConversationId)
  },
  scratch: async (args: string) => {
    const { scratchCommand } = await import("./scratch.ts")
    await scratchCommand(args)
    return { type: "scratch" }
  },
  voice: async () => {
    return { type: "voice" }
  },
  verbose: async () => {
    return { type: "verbose" }
  },
  search: async (args) => searchSlash(args),
  scrape: async (args) => scrapeSlash(args),
  interact: async (args) => interactSlash(args),
  crawl: async (args) => crawlSlash(args),
  parse: async (args) => parseSlash(args),
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

// Outer-scope variable so /plan subcommands can access the current conversation.
// Set by handleSlashCommand before dispatching.
let currentConversationId = ""

export function setCurrentConversationId(id: string) {
  currentConversationId = id
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

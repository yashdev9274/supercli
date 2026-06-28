import chalk from "chalk"
import { theme, frame } from "src/cli/utils/tui.ts"
import type { AIProvider } from "src/cli/ai/provider.ts"
import type { SlashCommandResult } from "./index.ts"

interface CompactArgs {
  provider: AIProvider
  conversationId: string
  getMessages: (id: string) => Promise<Array<{ role: string; content: string }>>
  saveSummary: (id: string, summary: string) => Promise<void>
}

export async function compactCommand(args: CompactArgs): Promise<SlashCommandResult> {
  if (!args.provider.model) {
    console.log(
      ` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)("/compact requires a direct model connection")}`,
    )
    return { type: "help" }
  }

  console.log(` ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.amber)("compacting conversation…")}`)

  const { compactConversation } = await import("src/service/compaction-service.ts")
  const messages = await args.getMessages(args.conversationId)
  if (messages.length < 4) {
    console.log(
      ` ${chalk.hex(theme.muted)("◆")} ${chalk.hex(theme.muted)("not enough history to compact (need 4+ messages)")}`,
    )
    return { type: "help" }
  }

  const result = await compactConversation(args.provider.model, messages)
  if (result.error) {
    console.log(
      ` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(`compaction failed: ${result.error}`)}`,
    )
    return { type: "help" }
  }

  await args.saveSummary(args.conversationId, result.summary)

  const savings =
    result.tokensBefore - result.tokensAfter
  const pct = result.tokensBefore > 0 ? Math.round((savings / result.tokensBefore) * 100) : 0

  const body = [
    `${chalk.hex(theme.green)("✓")} ${chalk.hex(theme.amber)("compaction complete")}`,
    "",
    `${chalk.hex(theme.muted)("before:")} ${chalk.hex(theme.white)(`${result.tokensBefore} tokens`)}`,
    `${chalk.hex(theme.muted)("after:")}  ${chalk.hex(theme.white)(`${result.tokensAfter} tokens`)}`,
    `${chalk.hex(theme.muted)("saved:")}  ${chalk.hex(theme.green)(`${savings} tokens (${pct}%)`)}`,
    "",
    chalk.hex(theme.muted)("summary preview:"),
    chalk.hex(theme.white)(result.summary.slice(0, 280) + (result.summary.length > 280 ? "…" : "")),
  ].join("\n")

  console.log(frame(body, { title: "compaction", borderColor: theme.green, padding: 0 }))
  console.log()

  return { type: "help" }
}
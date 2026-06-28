import chalk from "chalk"
import { theme, frame } from "src/cli/utils/tui.ts"
import {
  listScratch,
  readScratch,
  clearScratch,
  deleteScratch,
} from "src/lib/scratch.ts"

type Action = "list" | "show" | "clear" | "delete"

export async function scratchCommand(argsStr: string): Promise<{
  type: "help"
}> {
  const [action = "list", target] = argsStr.trim().split(/\s+/) as [Action?, string?]

  switch (action) {
    case "list": {
      const items = await listScratch()
      if (items.length === 0) {
        console.log(
          ` ${chalk.hex(theme.muted)("◆")} ${chalk.hex(theme.muted)("scratch dir is empty (.super/scratch/)")}`,
        )
        return { type: "help" }
      }
      const lines = items.slice(0, 20).map((it) => {
        const date = it.createdAt.toISOString().slice(11, 19)
        return `  ${chalk.hex(theme.green)(date)}  ${chalk.hex(theme.white)(it.name.padEnd(40))} ${chalk.hex(theme.muted)(`(${formatBytes(it.size)})`)}`
      })
      console.log(
        frame(
          `${chalk.hex(theme.amber)("$ scratch list")}\n${lines.join("\n")}`,
          { title: "scratch", borderColor: theme.green, padding: 0 },
        ),
      )
      return { type: "help" }
    }
    case "show": {
      if (!target) {
        console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)("usage: /scratch show <name>")}`)
        return { type: "help" }
      }
      const body = await readScratch(target)
      if (!body) {
        console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(`not found: ${target}`)}`)
        return { type: "help" }
      }
      console.log(frame(body, { title: target, borderColor: theme.green, padding: 0 }))
      return { type: "help" }
    }
    case "delete": {
      if (!target) {
        console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)("usage: /scratch delete <name>")}`)
        return { type: "help" }
      }
      const ok = await deleteScratch(target)
      console.log(
        ` ${ok ? chalk.hex(theme.green)("✓") : chalk.hex(theme.red)("✗")} ${chalk.hex(theme.muted)(`${target} ${ok ? "deleted" : "not found"}`)}`,
      )
      return { type: "help" }
    }
    case "clear": {
      await clearScratch()
      console.log(` ${chalk.hex(theme.green)("✓")} ${chalk.hex(theme.muted)("scratch dir cleared")}`)
      return { type: "help" }
    }
    default:
      console.log(
        ` ${chalk.hex(theme.muted)("◆")} ${chalk.hex(theme.muted)("usage: /scratch [list|show <name>|delete <name>|clear]")}`,
      )
      return { type: "help" }
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}
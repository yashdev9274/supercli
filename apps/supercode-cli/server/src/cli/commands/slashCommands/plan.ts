import chalk from "chalk"
import { theme, frame } from "src/cli/utils/tui.ts"
import { latestScratch, listScratch, readScratch } from "src/lib/scratch.ts"
import type { SlashCommandResult } from "./index.ts"

type PlanAction = "show" | "execute" | "list"

/**
 * Plan subcommand router. Handles:
 *   /plan         — switch into plan mode for the next turn
 *   /plan list    — list saved plans
 *   /plan show    — show the most recent plan
 *   /plan execute — feed the most recent plan into agent mode
 */
export async function planCommand(
  argsStr: string,
  conversationId: string,
): Promise<SlashCommandResult> {
  const [action = "show", target] = argsStr.trim().split(/\s+/) as [PlanAction?, string?]

  switch (action) {
    case "list": {
      const items = await listScratch()
      const plans = items.filter((it) => it.name.startsWith("plan-"))
      if (plans.length === 0) {
        console.log(
          ` ${chalk.hex(theme.muted)("◆")} ${chalk.hex(theme.muted)("no saved plans in .super/scratch/")}`,
        )
        return { type: "help" }
      }
      const lines = plans.slice(0, 10).map((p) => {
        const date = p.createdAt.toISOString().slice(11, 19)
        return `  ${chalk.hex(theme.green)(date)}  ${chalk.hex(theme.white)(p.name)}`
      })
      console.log(
        frame(
          `${chalk.hex(theme.amber)("$ plan list")}\n${lines.join("\n")}`,
          { title: "plans", borderColor: theme.green, padding: 0 },
        ),
      )
      return { type: "help" }
    }

    case "show": {
      const name = target ?? (await latestScratch("plan-"))?.name
      if (!name) {
        console.log(
          ` ${chalk.hex(theme.muted)("◆")} ${chalk.hex(theme.muted)("no saved plans. use /plan to generate one")}`,
        )
        return { type: "help" }
      }
      const body = await readScratch(name)
      if (!body) {
        console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(`not found: ${name}`)}`)
        return { type: "help" }
      }
      console.log(
        frame(body, {
          title: name,
          borderColor: theme.amber,
          padding: 0,
        }),
      )
      return { type: "help" }
    }

    case "execute": {
      const plan = await latestScratch("plan-")
      if (!plan) {
        console.log(
          ` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)("no plan to execute — run /plan first to generate one")}`,
        )
        return { type: "help" }
      }
      console.log(
        ` ${chalk.hex(theme.green)("✓")} ${chalk.hex(theme.muted)(`loaded plan: ${plan.name}`)}`,
      )
      return {
        type: "plan",
        label: "execute",
      }
    }

    default:
      console.log(
        ` ${chalk.hex(theme.muted)("◆")} ${chalk.hex(theme.muted)("usage: /plan [show|execute|list]")}`,
      )
      return { type: "help" }
  }
}

/**
 * Returns the path to the most recent saved plan, if any.
 */
export async function pendingPlanPath(): Promise<string | null> {
  const plan = await latestScratch("plan-")
  return plan?.path ?? null
}
#!/usr/bin/env bun

import "../lib/load-env"
import chalk from "chalk"
import { Command } from "commander"
import { loginCommand } from "./commands/login"
import {
  banner,
  panel,
  frame,
  statusIcon,
  bullet,
  dimmed,
  theme,
  hudPanel,
  ornamentalDivider,
  glow,
} from "./utils/tui"
import { supercodeInit } from "./commands/ai/init"

async function main() {
  console.clear()

  const tagline = "ai-powered coding agent"

  console.log()
  console.log(`  ${banner("SUPERCODE")}`)
  console.log(
    `  ${chalk.hex(theme.dim)("╰─")} ${chalk.hex(theme.amber).bold(tagline)} ${glow("◆", theme.cyan)} ${chalk.hex(theme.muted)(`v0.0.1`)}`,
  )
  console.log()

  console.log(
    frame(
      [
        hudPanel({ label: "ENGINE", value: "bun · typescript", status: "ok" }),
        hudPanel({ label: "AUTH", value: "better-auth · device flow", status: "ok", accent: theme.green }),
        hudPanel({ label: "MODEL", value: "BYO API key", status: "warn", accent: theme.warning }),
      ].join("\n"),
      { title: "system", borderColor: theme.dim, padding: 0 },
    ),
  )
  console.log()

  console.log(
    panel(
      [
        `  ${statusIcon("cmd")} ${chalk.hex(theme.cyan).bold("login")}`,
        `     ${chalk.hex(theme.muted)("Authenticate with the Supercode server")}`,
        `     ${dimmed("supercode login [--server-url <url>]")}`,
        "",
        `  ${statusIcon("cmd")} ${chalk.hex(theme.cyan).bold("help")}`,
        `     ${chalk.hex(theme.muted)("Show available commands and usage")}`,
        `     ${dimmed("supercode help")}`,
      ].join("\n"),
      { title: "commands", borderColor: theme.dim },
    ),
  )

  console.log()
  console.log(ornamentalDivider())

  console.log(
    `  ${bullet("run", theme.cyan)} ${chalk.hex(theme.cyan)("supercode login")}   ${dimmed("to get started")}`,
  )
  console.log(
    `  ${bullet("docs", theme.cyan)} ${chalk.hex(theme.cyan)(chalk.underline("supercode-terminal.vercel.app"))}`,
  )
  console.log()
  console.log(
    `  ${chalk.hex(theme.dim)("built with")} ${chalk.hex(theme.cyan)("bun")} ${chalk.hex(theme.dim)("·")} ${chalk.hex(theme.pink)("typescript")} ${chalk.hex(theme.dim)("·")} ${chalk.hex(theme.amber)("better-auth")}`,
  )
  console.log()

  const program = new Command("supercode")
  program
    .description("Supercode CLI - AI powered developer tools")
    .version("0.0.1")
    .addCommand(loginCommand)
    .addCommand(supercodeInit)

  program.action(async () => {
    program.help()
  })

  program.parse()
}

main().catch((err) => {
  console.error(chalk.hex(theme.red)("Error:"), err.message)
  process.exit(1)
})

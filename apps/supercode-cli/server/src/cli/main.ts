#!/usr/bin/env bun

import "../lib/load-env"
import { version } from "../../package.json"
import chalk from "chalk"
import { Command } from "commander"
import { loginCommand } from "./commands/login"
import { theme } from "./utils/tui"
import { supercodeInit } from "./commands/ai/init"
import { renderWelcome } from "./utils/welcome"

process.on("unhandledRejection", (reason) => {
  try {
    process.stderr.write(`\n[debug] unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}\n`)
  } catch {
    // stderr might be unavailable
  }
})
process.on("uncaughtException", (error) => {
  try {
    process.stderr.write(`\n[debug] uncaught exception: ${error.message}\n`)
  } catch {
    // stderr might be unavailable
  }
})

async function main() {
  const program = new Command("supercode")
  program
    .description("Supercode CLI - AI powered developer tools")
    .version(version)
    .addCommand(loginCommand)
    .addCommand(supercodeInit)

  program.action(async () => {
    renderWelcome(version)
    program.help()
  })

  program.parse()
}

main().catch((err) => {
  console.error(chalk.hex(theme.red)("Error:"), err.message)
  process.exit(1)
})
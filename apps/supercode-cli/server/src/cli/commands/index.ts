#!/usr/bin/env bun
import fs from "fs"
import chalk from "chalk"
import { loginAction, CONFIG_DIR, TOKEN_FILE } from "./login"
import { wakeUpAction } from "./ai/init"

const COMMANDS = ["login", "init", "help"] as const
type Command = (typeof COMMANDS)[number]

function isCommand(s: string): s is Command {
  return (COMMANDS as readonly string[]).includes(s)
}

function printHelp() {
  console.log(chalk.bold("\nSupercode CLI\n"))
  console.log("  Commands:")
  console.log("    login    Authenticate with the Supercode server")
  console.log("    init     Validate authentication by fetching your user info")
  console.log("\n  Usage:")
  console.log("    supercode [command]")
  console.log("    supercode login\n")
}

function getTokenInfo(): { valid: boolean; email?: string } {
  try {
    const raw = fs.readFileSync(TOKEN_FILE, "utf-8")
    const data = JSON.parse(raw)
    return {
      valid: data.access_token && Date.now() < new Date(data.expires_at).getTime(),
      email: data.email,
    }
  } catch {
    return { valid: false }
  }
}

export async function main() {
  const cmd = process.argv[2]

  if (!cmd || cmd === "help") {
    const token = getTokenInfo()
    if (token.valid) {
      console.log(chalk.green("✓ Authenticated" + (token.email ? ` as ${token.email}` : "")))
    }
    printHelp()
    return
  }

  if (!isCommand(cmd)) {
    console.error(chalk.red(`Unknown command: ${cmd}`))
    printHelp()
    process.exit(1)
  }

  if (cmd === "login") {
    await loginAction({})
  }

  if (cmd === "init") {
    await wakeUpAction()
  }
}

if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1]))) {
  main().catch((err) => {
    console.error(chalk.red("Error:"), err.message)
    process.exit(1)
  })

}

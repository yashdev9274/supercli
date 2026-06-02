#!/usr/bin/env bun

import chalk from "chalk"
import figlet from "figlet"
import { Command } from "commander"
import { loginCommand } from "./commands/login"


async function main() {
  // Display banner
  console.log(
    chalk.cyan(
      figlet.textSync("SUPERCODE", {
        font: "Standard",
        horizontalLayout: "default",
      })
    )
  )

  console.log(chalk.gray("A cli based AI Tool \n"))

  // TODO: wire up Commander commands here, e.g.:
  const program = new Command('supercode')
  program
    .description("Orbital CLI - AI powered developer tools")
    .version("0.0.1")
    .addCommand(loginCommand)

  program.action(async () => {
    program.help()
  })

  program.parse()
  
  // program
  //   .command("login")
  //   .description("Authenticate with the Orbital AI service")
  //   .action(async () => {
  //     await loginAction({})
  //   })
  //
  // program.parse(process.argv)
}

main().catch((err) => {
  console.error(chalk.red("Error:"), err.message)
  process.exit(1)
})

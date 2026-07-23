import chalk from "chalk"
import { Command } from "commander"
import { listInstalledSkills } from "@super/skills"
import { theme } from "../../utils/tui"
import { version } from "../../../../package.json"

const dim = chalk.hex(theme.dim)
const white = chalk.hex(theme.white)
const green = chalk.hex(theme.green)
const muted = chalk.hex(theme.muted)

export const skillListCommand = new Command("list")
  .description("List installed skills")
  .action(async () => {
    const skills = await listInstalledSkills()

    if (skills.length === 0) {
      console.log(`  ${muted("No skills installed.")}`)
      console.log(`  ${muted(`Run ${green("supercode skill add <name> --source <owner/repo>")} ${muted("to install one.")}`)}`)
      return
    }

    console.log()
    console.log(`  ${green.bold("Installed Skills")} ${muted(`(${skills.length})`)}`)
    console.log()

    for (const skill of skills) {
      const icon = chalk.hex(theme.green)("◆")
      const name = white.bold(skill.name)
      const desc = skill.description
        ? muted(skill.description)
        : dim("(no description)")
      const source = dim(`from ${skill.definition.source}`)

      console.log(`  ${icon}  ${name}`)
      console.log(`      ${desc}`)
      console.log(`      ${source}`)
      console.log()
    }

    console.log(`  ${dim(`CLI version: ${version}`)}`)
    console.log()
  })

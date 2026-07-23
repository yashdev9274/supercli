import chalk from "chalk"
import { Command } from "commander"
import { uninstallSkill } from "@super/skills"
import { theme } from "../../utils/tui"

const dim = chalk.hex(theme.dim)
const white = chalk.hex(theme.white)
const red = chalk.hex(theme.red)
const green = chalk.hex(theme.green)

export const skillRemoveCommand = new Command("remove")
  .description("Uninstall a skill")
  .argument("<name>", "Skill name")
  .action(async (name: string) => {
    console.log(`  ${chalk.hex(theme.green)("◆")} ${white("Removing skill")} ${chalk.bold(name)}...`)

    try {
      await uninstallSkill(name)
      console.log(`  ${green("✓")} ${white("Skill")} ${chalk.bold(name)} ${dim("removed")}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ${red("✗")} ${white("Failed to remove skill:")} ${msg}`)
      process.exit(1)
    }
  })

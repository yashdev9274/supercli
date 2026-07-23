import chalk from "chalk"
import { Command } from "commander"
import { installSkill } from "@super/skills"
import { theme } from "../../utils/tui"

const dim = chalk.hex(theme.dim)
const white = chalk.hex(theme.white)
const green = chalk.hex(theme.green)
const red = chalk.hex(theme.red)

export const skillAddCommand = new Command("add")
  .description("Install a skill from a GitHub source")
  .argument("<name>", "Skill name (e.g. frontend-design)")
  .option(
    "-s, --source <owner/repo>",
    "GitHub source (e.g. anthropics/skills)",
  )
  .option(
    "-p, --path <skill-path>",
    "Path to SKILL.md within the repo (default: skills/<name>/SKILL.md)",
  )
  .action(async (name: string, opts: { source?: string; path?: string }) => {
    if (!opts.source) {
      console.error(`  ${red("Error:")} ${dim("--source is required.")}`)
      console.error(`  ${dim("Usage: supercode skill add <name> --source <owner/repo>")}`)
      process.exit(1)
    }

    console.log(`  ${chalk.hex(theme.green)("◆")} ${white("Installing skill")} ${chalk.bold(name)} ${dim(`from ${opts.source}...`)}`)

    try {
      await installSkill(name, opts.source, opts.path)
      console.log(`  ${chalk.hex(theme.green)("✓")} ${white("Skill")} ${chalk.bold(name)} ${green("installed successfully")}`)
      console.log(`  ${dim(`  Source: ${opts.source}${opts.path ? ` / ${opts.path}` : ""}`)}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ${red("✗")} ${white("Failed to install skill:")} ${msg}`)
      process.exit(1)
    }
  })

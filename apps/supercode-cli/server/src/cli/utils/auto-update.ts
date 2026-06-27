import { version } from "../../../package.json"
import chalk from "chalk"
import { theme, createThinking } from "./tui"
import { confirm, isCancel } from "@clack/prompts"

const NPM_PACKAGE = "supercode-cli"

export async function checkForUpdate(): Promise<void> {
  try {
    const thinking = createThinking("checking for update")
    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      thinking.fail()
      return
    }
    const data = (await res.json()) as { version: string }
    const latest = data.version

    if (latest === version) {
      thinking.succeed(`v${version} (latest)`)
      return
    }

    thinking.stop()
    console.log()
    console.log(
      `  ${chalk.hex(theme.amber)("◆")}  ${chalk.hex(theme.green).bold("Update available:")} ${chalk.hex(theme.greenDim)(`v${version}`)} → ${chalk.hex(theme.greenGlow)(`v${latest}`)}`,
    )
    console.log()

    const shouldUpdate = await confirm({
      message: "Update to latest version?",
      initialValue: true,
    })

    if (isCancel(shouldUpdate) || !shouldUpdate) {
      console.log(`  ${chalk.hex(theme.greenMute)("Skipping update")}`)
      console.log()
      return
    }

    const spinner = createThinking("updating supercode")
    try {
      const result = await Bun.$`npm install -g ${NPM_PACKAGE}@latest`.quiet()
      if (result.exitCode === 0) {
        spinner.succeed(`Updated to v${latest}`)
        console.log()
      } else {
        throw new Error(`exit code ${result.exitCode}`)
      }
    } catch {
      spinner.fail("Update failed")
      console.log(`  ${chalk.hex(theme.greenMute)("Continuing with current version")}`)
      console.log()
    }
  } catch {
    // Network error or timeout — continue silently
  }
}

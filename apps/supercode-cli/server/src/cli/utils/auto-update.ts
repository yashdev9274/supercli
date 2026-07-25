import { version } from "../../../package.json"
import chalk from "chalk"
import { theme, createThinking } from "./tui"

const NPM_PACKAGE = "supercode-cli"

/**
 * Check npm registry for a newer version and print a banner if one exists.
 * Notification-only — never prompts or installs.
 * Users should run `supercode upgrade` to actually install.
 */
export async function checkForUpdate(): Promise<void> {
  const thinking = createThinking("checking for update")
  try {
    const res = await fetch(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) {
      thinking.fail("could not reach registry")
      return
    }
    const data = (await res.json()) as { version?: unknown }
    if (typeof data.version !== "string" || data.version.length === 0) {
      thinking.fail("invalid registry response")
      return
    }
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
    console.log(
      `  ${chalk.hex(theme.greenMute)("Run")} ${chalk.hex(theme.greenGlow)("supercode upgrade")} ${chalk.hex(theme.greenMute)("to update.")}`,
    )
    console.log()
  } catch {
    thinking.fail("update check failed")
  }
}

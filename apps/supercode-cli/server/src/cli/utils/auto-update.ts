import { version } from "../../../package.json"
import chalk from "chalk"
import { compareVersions, fetchLatestVersion, NPM_PACKAGE } from "./version"
import { theme, createThinking } from "./tui"

/**
 * Check npm registry for a newer version and print a banner if one exists.
 * Notification-only — never prompts or installs.
 * Users should run `supercode upgrade` to actually install.
 */
export async function checkForUpdate(): Promise<void> {
  const thinking = createThinking("checking for update")

  const latest = await fetchLatestVersion(NPM_PACKAGE)
  if (!latest) {
    thinking.fail("could not reach registry")
    return
  }

  const cmp = compareVersions(version, latest)
  if (cmp === 0) {
    thinking.succeed(`v${version} (latest)`)
    return
  }
  if (cmp === 1) {
    thinking.succeed(`v${version} (ahead of npm)`)
    return
  }
  if (cmp === null) {
    thinking.fail("could not compare versions")
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
}

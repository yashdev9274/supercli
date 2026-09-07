import { execFileSync } from "child_process"
import { Command } from "commander"
import chalk from "chalk"
import { confirm, isCancel } from "@clack/prompts"
import { version as currentVersion } from "../../../package.json"
import { theme, createThinking } from "../utils/tui"
import { compareVersions, fetchLatestVersion, NPM_PACKAGE } from "../utils/version"
import { saveCliConfig } from "src/lib/cli-config"

export async function upgradeAction(options: { yes?: boolean }): Promise<void> {

  const thinking = createThinking("checking npm registry")

  const latestVersion = await fetchLatestVersion(NPM_PACKAGE)

  if (!latestVersion) {
    thinking.fail("Could not reach npm registry")
    console.log()
    console.log(`  ${chalk.hex(theme.muted)("Check your internet connection and try again.")}`)
    console.log()
    process.exit(1)
  }

  const cmp = compareVersions(currentVersion, latestVersion)

  if (cmp === 0) {
    thinking.succeed(`v${currentVersion} (latest)`)
    console.log()
    console.log(`  ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.greenMute)("You're on the latest version.")}`)
    console.log()
    return
  }

  if (cmp === null) {
    thinking.fail(`Could not compare versions: ${currentVersion} vs ${latestVersion}`)
    process.exit(1)
  }

  if (cmp === 1) {
    thinking.succeed(`v${currentVersion} (newer than npm's v${latestVersion})`)
    console.log()
    console.log(`  ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.greenMute)("You're on a pre-release or local build — no upgrade needed.")}`)
    console.log()
    return
  }

  // currentVersion < latestVersion
  thinking.stop()
  console.log()
  console.log(
    `  ${chalk.hex(theme.amber)("◆")}  ${chalk.hex(theme.green).bold("Update available:")} ${chalk.hex(theme.greenDim)(`v${currentVersion}`)} → ${chalk.hex(theme.greenGlow)(`v${latestVersion}`)}`,
  )
  console.log()

  if (!options.yes) {
    const shouldUpdate = await confirm({
      message: "Update to latest version?",
      initialValue: true,
    })

    if (isCancel(shouldUpdate) || !shouldUpdate) {
      console.log(`  ${chalk.hex(theme.greenMute)("Skipping update")}`)
      console.log()
      return
    }
  }

  const spinner = createThinking("upgrading supercode")

  try {
    execFileSync("bun", ["install", "-g", `${NPM_PACKAGE}@latest`], { stdio: "pipe" })
    await saveCliConfig({ checkForUpdates: true })
    spinner.succeed(`Updated to v${latestVersion}`)
    console.log()
    console.log(`  ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.greenMute)("Run")} ${chalk.hex(theme.greenGlow)("supercode --version")} ${chalk.hex(theme.greenMute)("to confirm.")}`)
    console.log()
  } catch {
    spinner.fail("Upgrade failed")
    console.log(`  ${chalk.hex(theme.greenMute)("Try running manually:")}`)
    console.log(`  ${chalk.hex(theme.greenGlow)("bun install -g")} ${chalk.hex(theme.greenDim)(`${NPM_PACKAGE}@latest`)}`)
    console.log(`  ${chalk.hex(theme.greenGlow)("npm install -g")} ${chalk.hex(theme.greenDim)(`${NPM_PACKAGE}@latest`)}`)
    console.log()
    process.exit(1)
  }
}

export const upgradeCommand = new Command("upgrade")
  .description("Check for updates and upgrade the CLI to the latest version")
  .option("-y, --yes", "Skip confirmation prompt and upgrade immediately")
  .action(async (opts: { yes?: boolean }) => {
    await upgradeAction({ yes: opts.yes })
  })

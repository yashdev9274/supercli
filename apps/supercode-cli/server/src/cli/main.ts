#!/usr/bin/env bun

import "../lib/load-env"
import { version } from "../../package.json"
import chalk from "chalk"
import { Command } from "commander"
import { loginCommand } from "./commands/login"
import {
  pixelWordmark,
  frame,
  sectionHeader,
  cardStack,
  rowCard,
  heavyDivider,
  keyValue,
  statusBar,
  sectionHeading,
  statusIcon,
  hudPanel,
  theme,
} from "./utils/tui"
import { supercodeInit } from "./commands/ai/init"

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

function center(text: string): string {
  const w = process.stdout.columns ?? 80
  const stripped = text.replace(/\x1b\[[0-9;]*m/g, "")
  const pad = Math.max(0, Math.floor((w - stripped.length) / 2))
  return " ".repeat(pad) + text
}

async function main() {
  console.clear()
  console.log()

  // ── Pixel wordmark ─────────────────────────────────────────────
  const wordmark = pixelWordmark("SUPERCODE", { color: theme.green, shadow: theme.greenDim })
  const firstLine = wordmark.split("\n")[0] ?? ""
  const strippedLen = firstLine.replace(/\x1b\[[0-9;]*m/g, "").length
  const w = process.stdout.columns ?? 80
  const pad = Math.max(0, Math.floor((w - strippedLen) / 2))
  console.log()
  wordmark.split("\n").forEach((line) => {
    console.log(" ".repeat(pad) + line)
  })
  console.log()

  // ── Tagline + version row ──────────────────────────────────────
  const taglineRow = `  ${chalk.hex(theme.amber)("▸")}  ${chalk.hex(theme.greenGlow).bold("ai-powered coding agent")}  ${chalk.hex(theme.greenDim)("·")}  ${chalk.hex(theme.greenMute)("v" + version)}`
  console.log(taglineRow)
  console.log()

  // ── SYSTEM block ───────────────────────────────────────────────
  const systemBlock = [
    hudPanel({ label: "engine", value: "bun · typescript", status: "ok" }),
    hudPanel({ label: "auth", value: "better-auth · device flow", status: "ok" }),
    hudPanel({ label: "model", value: "byo api key", status: "warn", accent: theme.amber }),
    hudPanel({ label: "version", value: version, accent: theme.greenGlow }),
  ].join("\n")
  console.log(frame(systemBlock, { title: "system", borderColor: theme.greenDim, padding: 0 }))
  console.log()

  // ── COMMANDS section ───────────────────────────────────────────
  console.log(sectionHeader("commands", { accent: "green" }))
  console.log()

  const loginRow = rowCard({
    label: "login",
    description: "authenticate with the supercode server",
    selected: true,
  })
  const helpRow = rowCard({
    label: "help",
    description: "show available commands and usage",
  })
  const initRow = rowCard({
    label: "init",
    description: "initialize supercode in the current workspace",
  })
  const chatRow = rowCard({
    label: "chat",
    description: "start an interactive ai coding session",
  })

  console.log(cardStack({
    title: "available",
    rows: [loginRow, helpRow, initRow, chatRow],
  }))
  console.log()

  // ── Footer ─────────────────────────────────────────────────────
  console.log(heavyDivider())
  console.log()

  console.log(
    `  ${chalk.hex(theme.amber)("▸")}  ${chalk.hex(theme.green).bold("run")} ${chalk.hex(theme.greenGlow)("supercode login")}  ${chalk.hex(theme.greenDim)("to get started")}`,
  )
  console.log(
    `  ${chalk.hex(theme.amber)("▸")}  ${chalk.hex(theme.green).bold("docs")} ${chalk.hex(theme.greenGlow)("supercli-docs.vercel.app/")}`,
  )
  console.log()

  console.log(
    statusBar({
      left: ["supercode", `v${version}`],
      right: ["ready", "type 'help'"],
    }),
  )
  console.log()
  console.log(
    `  ${chalk.hex(theme.greenDim)("built with")} ${chalk.hex(theme.greenGlow)("bun")} ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.amber)("typescript")} ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)("better-auth")}`,
  )
  console.log()

  const program = new Command("supercode")
  program
    .description("Supercode CLI - AI powered developer tools")
    .version(version)
    .addCommand(loginCommand)
    .addCommand(supercodeInit)

  program.action(async () => {
    program.help()
  })

  program.parse()
}

main().catch((err) => {
  console.error(chalk.hex(theme.red)("Error:"), err.message)
  process.exit(1)
})
import chalk from "chalk"
import boxen from "boxen"
import yoctoSpinner from "yocto-spinner"
import figlet from "figlet"

export const theme = {
  // Core palette
  cyan: "#00f7ff",
  pink: "#ff0088",
  amber: "#ffb347",
  green: "#00ff88",
  red: "#ff2244",
  warning: "#ffaa33",

  // Extended palette
  magenta: "#bf40ff",
  blue: "#4488ff",
  teal: "#00ccbb",

  // UI tones
  muted: "#667788",
  dim: "#2a3a4a",
  darker: "#111922",
  deep: "#080c14",
  surface: "#0a0f18",
  border: "#1a2a3a",
  text: "#e6edf3",
  accent: "#58a6ff",

  // Glow variants
  glowCyan: "#66ffff",
  glowPink: "#ff66cc",
  glowGreen: "#66ffbb",
} as const

function hexToRgb(hex: string) {
  const h = hex.replace("#", "")
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

function lerpColor(c1: string, c2: string, t: number): string {
  const a = hexToRgb(c1)
  const b = hexToRgb(c2)
  const r = Math.round(a.r + (b.r - a.r) * t)
  const g = Math.round(a.g + (b.g - a.g) * t)
  const bl = Math.round(a.b + (b.b - a.b) * t)
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`
}

function rgb(hex: string) {
  const c = hexToRgb(hex)
  return `${c.r};${c.g};${c.b}`
}

export function gradientText(text: string, from: string, to: string): string {
  const chars = [...text]
  return chars
    .map((char, i) => {
      if (char === " " || char === "\n") return char
      const ratio = i / Math.max(chars.length - 1, 1)
      return chalk.hex(lerpColor(from, to, ratio))(char)
    })
    .join("")
}

export function glow(text: string, color: string): string {
  const c = hexToRgb(color)
  const glowColor = `#${Math.min(c.r + 80, 255).toString(16).padStart(2, "0")}${Math.min(c.g + 80, 255).toString(16).padStart(2, "0")}${Math.min(c.b + 80, 255).toString(16).padStart(2, "0")}`
  return chalk.hex(glowColor)(text)
}

export function banner(text: string): string {
  const art = figlet.textSync(text, { font: "ANSI Shadow" })
  return gradientText(art, theme.cyan, theme.pink)
}

export function dualBanner(top: string, bottom: string): string {
  const topArt = figlet.textSync(top, { font: "ANSI Shadow" })
  const bottomArt = figlet.textSync(bottom, { font: "ANSI Shadow" })
  const topLines = topArt.split("\n")
  const bottomLines = bottomArt.split("\n")
  const gap = 1
  const combined = [
    ...topLines,
    ...Array(gap).fill(""),
    ...bottomLines,
  ].join("\n")
  return gradientText(combined, theme.cyan, theme.pink)
}

export function frame(
  content: string,
  opts?: {
    title?: string
    borderColor?: string
    glowColor?: string
    width?: number
    padding?: number
  },
): string {
  const bc = opts?.borderColor ?? theme.border
  const pad = opts?.padding ?? 1
  const terminalWidth = process.stdout.columns ?? 80
  const innerWidth = (opts?.width ?? Math.min(terminalWidth - 4, 72)) - 4

  const topChar = "━"
  const cornerTL = "┏"
  const cornerTR = "┓"
  const cornerBL = "┗"
  const cornerBR = "┛"
  const vert = "┃"

  const titlePart = opts?.title
    ? ` ${chalk.hex(theme.muted)(opts.title)} `
    : ""

  const topBorder = `${cornerTL}${topChar.repeat(innerWidth)}${cornerTR}`
  const bottomBorder = `${cornerBL}${topChar.repeat(innerWidth)}${cornerBR}`

  const contentLines = content.split("\n")
  const paddedLines = [
    ...Array(pad).fill(""),
    ...contentLines,
    ...Array(pad).fill(""),
  ]
  const framedContent = paddedLines
    .map((line) => {
      const visible = stripAnsi(line)
      const remaining = Math.max(0, innerWidth - visible.length)
      return `${chalk.hex(bc)(vert)}${line}${" ".repeat(remaining)}${chalk.hex(bc)(vert)}`
    })
    .join("\n")

  const titleBorder = titlePart
    ? `${chalk.hex(bc)(cornerTL)}${chalk.hex(bc)(topChar)}${titlePart}${chalk.hex(bc)(topChar.repeat(Math.max(0, innerWidth - titlePart.length + 4)))}${chalk.hex(bc)(cornerTR)}`
    : chalk.hex(bc)(topBorder)

  return [titleBorder, framedContent, chalk.hex(bc)(bottomBorder)].join("\n")
}

export function panel(content: string, opts?: { title?: string; borderColor?: string }) {
  return boxen(content, {
    padding: { top: 1, bottom: 1, left: 2, right: 2 },
    margin: 0,
    borderStyle: "round",
    borderColor: opts?.borderColor ?? theme.darker,
    title: opts?.title
      ? chalk.hex(theme.muted)(` ${opts.title} `)
      : undefined,
    titleAlignment: "left",
    float: "left",
  })
}

export function miniPanel(content: string) {
  return boxen(content, {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: 0,
    borderStyle: "single",
    borderColor: theme.darker,
    dimBorder: true,
    float: "left",
  })
}

export function separator(char = "─", color = theme.dim): string {
  const width = process.stdout.columns ?? 80
  const line = char.repeat(Math.min(width - 1, 50))
  return chalk.hex(color)(line)
}

export function divider(char = "─", color = theme.dim): string {
  return separator(char, color)
}

export function label(text: string, color = theme.muted): string {
  return chalk.hex(color)(`▎${text}`)
}

export function tag(text: string, color = theme.cyan): string {
  return boxen(chalk.hex(color)(text), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: "single",
    borderColor: color,
    dimBorder: true,
    float: "left",
  })
}

export function step(
  number: number,
  text: string,
  state: "active" | "done" | "pending" | "error" = "pending",
): string {
  const icons = {
    active: chalk.hex(theme.cyan)("●"),
    done: chalk.hex(theme.green)("✓"),
    pending: chalk.hex(theme.dim)("○"),
    error: chalk.hex(theme.red)("✕"),
  }
  const colors = {
    active: chalk.hex(theme.cyan),
    done: chalk.hex(theme.green),
    pending: chalk.hex(theme.dim),
    error: chalk.hex(theme.red),
  }
  return `  ${icons[state]} ${colors[state](`Step ${number}:`)} ${state === "done" ? chalk.hex(theme.muted)(text) : colors[state](text)}`
}

export function stepChain(steps: Array<{ number: number; text: string; state: "active" | "done" | "pending" | "error" }>): string {
  return steps
    .map((s, i) => {
      const line = step(s.number, s.text, s.state)
      const isLast = i === steps.length - 1
      const connector = s.state === "done" && !isLast
        ? `  ${chalk.hex(theme.green)}│`
        : s.state === "active" && !isLast
          ? `  ${chalk.hex(theme.cyan)}│`
          : ""
      return connector ? `${line}\n${connector}` : line
    })
    .join("\n")
}

export function statusIcon(type: "success" | "error" | "warning" | "info" | "cmd"): string {
  const map = {
    success: chalk.hex(theme.green)("◆"),
    error: chalk.hex(theme.red)("◆"),
    warning: chalk.hex(theme.warning)("◆"),
    info: chalk.hex(theme.cyan)("◇"),
    cmd: chalk.hex(theme.cyan)("▸"),
  }
  return map[type]
}

export function codeBlock(code: string, language?: string): string {
  const lines = code.split("\n")
  const header = language ? ` ${chalk.hex(theme.muted)(language)} ` : ""
  const wrapped = lines
    .map((line) => `  ${chalk.hex(theme.cyan)(line)}`)
    .join("\n")
  return boxen(header + "\n" + wrapped, {
    padding: { top: 1, bottom: 1, left: 2, right: 2 },
    borderStyle: "single",
    borderColor: theme.darker,
    dimBorder: true,
    float: "left",
  })
}

export function createSpinner(text: string) {
  return yoctoSpinner({
    text: chalk.hex(theme.muted)(text),
    color: "cyan",
  })
}

export function successBox(message: string, subtitle?: string): string {
  return boxen(
    [
      `  ${chalk.hex(theme.green)("◆")}  ${chalk.hex(theme.green).bold(message)}`,
      ...(subtitle ? [`     ${chalk.hex(theme.muted)(subtitle)}`] : []),
    ].join("\n"),
    {
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      borderStyle: "round",
      borderColor: theme.darker,
      float: "left",
    },
  )
}

export function errorBox(message: string): string {
  return boxen(
    `  ${chalk.hex(theme.red)("◆")}  ${chalk.hex(theme.red)(message)}`,
    {
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      borderStyle: "round",
      borderColor: theme.darker,
      float: "left",
    },
  )
}

export function infoBox(message: string): string {
  return boxen(
    `  ${chalk.hex(theme.cyan)("◇")}  ${chalk.hex(theme.muted)(message)}`,
    {
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      borderStyle: "round",
      borderColor: theme.darker,
      dimBorder: true,
      float: "left",
    },
  )
}

export function heading(text: string): string {
  return `${chalk.hex(theme.cyan)("┃")} ${chalk.hex(theme.text).bold(text)}`
}

export function bullet(text: string, color?: string): string {
  return `  ${chalk.hex(theme.dim)("•")} ${chalk.hex(color ?? theme.muted)(text)}`
}

export function dimmed(text: string): string {
  return chalk.hex(theme.dim)(text)
}

export function progressBar(current: number, total: number, width = 20): string {
  const ratio = Math.min(current / total, 1)
  const filled = Math.round(ratio * width)
  const empty = width - filled
  const bar = [
    chalk.hex(theme.cyan)("█".repeat(filled)),
    chalk.hex(theme.dim)("█".repeat(empty)),
  ].join("")
  const pct = chalk.hex(theme.muted)(`${Math.round(ratio * 100)}%`)
  return `${bar} ${pct}`
}

export function hudPanel(options: {
  label: string
  value: string
  status?: "ok" | "warn" | "err"
  accent?: string
}): string {
  const color = options.accent ?? theme.cyan
  const statusMap = {
    ok: chalk.hex(theme.green)("●"),
    warn: chalk.hex(theme.warning)("●"),
    err: chalk.hex(theme.red)("●"),
  }
  const statusDot = options.status ? statusMap[options.status] : ""
  const statusPart = statusDot ? ` ${statusDot}` : ""
  return `${chalk.hex(theme.dim)("┃")} ${chalk.hex(color).bold(options.label)}: ${chalk.hex(theme.text)(options.value)}${statusPart}`
}

export function keyValue(key: string, value: string, keyColor?: string): string {
  return `  ${chalk.hex(keyColor ?? theme.cyan).bold(key)}: ${chalk.hex(theme.text)(value)}`
}

export function table(headers: string[], rows: string[][]): string {
  const colWidths: number[] = headers.map((h, i) =>
    Math.max(
      stripAnsi(h).length,
      ...rows.map((r) => {
        const v = r[i]
        return stripAnsi(v ?? "").length
      }),
    ),
  )
  const gw = (i: number) => colWidths[i] ?? 0
  const hr = colWidths.map((_, i) => "─".repeat(gw(i) + 2)).join("┼")
  const headerLine = headers
    .map((h, i) => ` ${chalk.hex(theme.cyan)(h.padEnd(gw(i)))} `)
    .join("│")
  const separatorLine = chalk.hex(theme.dim)(hr)
  const bodyLines = rows.map((row) =>
    row
      .map((cell, i) => ` ${cell.padEnd(gw(i) + (stripAnsi(cell).length !== cell.length ? 0 : 0))} `)
      .join("│"),
  )

  return [
    chalk.hex(theme.dim)(`┌${colWidths.map((_, i) => "─".repeat(gw(i) + 2)).join("┬")}┐`),
    `│${headerLine}│`,
    separatorLine,
    ...bodyLines.map((l) => `│${l}│`),
    chalk.hex(theme.dim)(`└${colWidths.map((_, i) => "─".repeat(gw(i) + 2)).join("┴")}┘`),
  ].join("\n")
}

export function systemLine(text: string): string {
  const ts = chalk.hex(theme.dim)(new Date().toLocaleTimeString())
  return `${chalk.hex(theme.dim)("[")}${ts}${chalk.hex(theme.dim)("]")} ${chalk.hex(theme.muted)(text)}`
}

export function ornamentalDivider(width?: number): string {
  const w = width ?? Math.min(process.stdout.columns ?? 80, 60)
  const left = "▓".repeat(2)
  const mid = "▒".repeat(Math.max(0, w - 6))
  const right = "▓".repeat(2)
  return chalk.hex(theme.dim)(`${left}${mid}${right}`)
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

//
// ─── REFINED TUI FUNCTIONS ───────────────────────────────────
// New rendering primitives designed for the chat UI.
// Uses the same theme tokens as above.
//

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function createThinking(label = "thinking"): { stop: () => void; succeed: (text?: string) => void; fail: (text?: string) => void } {
  let i = 0
  let running = true
  const id = setInterval(() => {
    if (!running) return
    process.stdout.write(`\r${chalk.hex(theme.cyan)(SPINNER_FRAMES[i])} ${chalk.hex(theme.muted)(label)}`)
    i = (i + 1) % SPINNER_FRAMES.length
  }, 80)

  function clear() {
    process.stdout.write("\r" + " ".repeat(process.stdout.columns ?? 60) + "\r")
  }

  return {
    stop: () => {
      running = false
      clearInterval(id)
      clear()
    },
    succeed: (text?: string) => {
      running = false
      clearInterval(id)
      clear()
      if (text) console.log(` ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.muted)(text)}`)
    },
    fail: (text?: string) => {
      running = false
      clearInterval(id)
      clear()
      if (text) console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(text)}`)
    },
  }
}

export type MessageRole = "user" | "assistant" | "system"

export function messageBlock(content: string, opts?: { role?: MessageRole; title?: string; compact?: boolean }) {
  const role = opts?.role ?? "assistant"
  const color = role === "user" ? theme.cyan : role === "system" ? theme.amber : theme.green
  const defaultTitle = role === "user" ? "you" : "supercode"
  const title = opts?.title ?? defaultTitle
  const lines = content.split("\n")
  const terminalWidth = process.stdout.columns ?? 80
  const innerWidth = terminalWidth - 6

  const topBorder = `┏${"━".repeat(Math.min(title.length + 2, innerWidth))} ${chalk.hex(color).bold(title)} ${"━".repeat(Math.max(0, innerWidth - title.length - 4))}`

  const body = opts?.compact
    ? lines.slice(0, 3).map((l) => `${chalk.hex(color)("┃")} ${l}`).join("\n") + (lines.length > 3 ? `\n${chalk.hex(color)("┃")} ${chalk.hex(theme.muted)(`... +${lines.length - 3} more lines`)}` : "")
    : lines.map((l) => `${chalk.hex(color)("┃")} ${l}`).join("\n")

  const bottomBorder = `${chalk.hex(color)("┗")}${chalk.hex(theme.dim)("━".repeat(Math.max(0, innerWidth + 2)))}`

  return [chalk.hex(color)(topBorder), body, bottomBorder].join("\n")
}

export function streamHeader(model: string, label = "supercode") {
  const ts = new Date().toLocaleTimeString()
  const w = process.stdout.columns ?? 80
  const line = `┏━━ ${chalk.hex(theme.green).bold(label)} ${chalk.hex(theme.muted)(`· ${model} · ${ts}`)} ${"━".repeat(Math.max(0, w - label.length - model.length - ts.length - 18))}`
  console.log(chalk.hex(theme.green)(line))
}

export function streamFooter(usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }, elapsedMs?: number, model?: string) {
  const parts: string[] = []
  if (usage && (usage.totalTokens || usage.promptTokens || usage.completionTokens)) {
    const t = usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0)
    parts.push(`${t} tokens`)
  }
  if (elapsedMs !== undefined) {
    const time = elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`
    parts.push(time)
  }
  if (model) parts.push(model)
  const meta = parts.length > 0 ? ` ${chalk.hex(theme.muted)(parts.join(" · "))}` : ""

  const w = process.stdout.columns ?? 80
  const base = `┗${"━".repeat(Math.max(0, w - 2))}`
  console.log(chalk.hex(theme.dim)(base + meta.slice(0, w - base.length)))
}

export function responseDivider() {
  const w = process.stdout.columns ?? 80
  console.log(chalk.hex(theme.dim)(` ${"─".repeat(Math.max(0, w - 2))}`))
}

export function streamingLine(text: string) {
  process.stdout.write(`${chalk.hex(theme.green)("┃")} ${text}`)
}

export function userMessage(content: string) {
  const lines = content.split("\n")
  console.log(chalk.hex(theme.cyan)(`┏━━ ${chalk.bold("you")} ${"━".repeat(Math.max(0, (process.stdout.columns ?? 80) - 10))}`))
  for (const line of lines) {
    console.log(`${chalk.hex(theme.cyan)("┃")} ${line}`)
  }
  console.log(chalk.hex(theme.cyan)(`┗${"━".repeat(Math.max(0, (process.stdout.columns ?? 80) - 4))}`))
  console.log()
}

export function compactMessageSummary(role: string, content: string, index: number) {
  const color = role === "user" ? theme.cyan : theme.green
  const icon = role === "user" ? "─" : "─"
  const firstLine = content.split("\n")[0] ?? ""
  const truncated = firstLine.length > 72 ? firstLine.slice(0, 69) + "..." : firstLine
  console.log(` ${chalk.hex(theme.dim)(`${index}.`)} ${chalk.hex(color)(icon)} ${chalk.hex(theme.muted)(truncated)}`)
}

export function sessionSummary(conversation: { id: string; title: string | null; mode: string; createdAt: Date; messages?: { role: string }[] }) {
  const msgCount = conversation.messages?.length ?? 0
  const title = conversation.title ?? "Untitled"
  const date = conversation.createdAt.toLocaleDateString()
  return panel(
    [
      `  ${chalk.hex(theme.green).bold(title)}`,
      `  ${chalk.hex(theme.muted)(`${msgCount} messages · ${date} · ${conversation.mode}`)}`,
      `  ${chalk.hex(theme.dim)(conversation.id)}`,
    ].join("\n"),
    { title: "session", borderColor: theme.dim },
  )
}

export function chatHelp() {
  const lines = [
    ` ${chalk.hex(theme.cyan)("Enter")}     send message`,
    ` ${chalk.hex(theme.cyan)("Esc")}      cancel / exit`,
    ` ${chalk.hex(theme.cyan)("↑/↓")}     navigate history`,
  ]
  return panel(lines.join("\n"), { title: "keys", borderColor: theme.dim })
}

export function timediff(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

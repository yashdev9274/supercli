import chalk from "chalk"
import * as readline from "readline"
import boxen from "boxen"
import yoctoSpinner from "yocto-spinner"
import { highlightLine } from "./code-highlighter"

//
// ─── PHOSPHOR TERMINAL THEME ──────────────────────────────────────────────────
//
// Single coherent aesthetic: green phosphor CRT on pure black, amber as the
// only warm accent (cursor + RECOMMENDED badge), with ASCII box-drawing,
// pixel/bitmap wordmark, and hard-edged rectangular cards.
//
export const theme = {
  // Phosphor greens (primary palette)
  green: "#00ff88",        // bright phosphor — selected, headers, borders
  greenDim: "#1a4a36",     // dim phosphor — borders, pending
  greenDeep: "#0a2a1c",    // deep — subtle fills
  greenGlow: "#7fffb4",    // glow — accents, soft highlights
  greenMute: "#3a6e54",    // muted — labels, secondary text

  // Warm accents (used sparingly)
  amber: "#ffb84d",        // RECOMMENDED badge, cursor caret
  amberDim: "#7a5520",
  red: "#ff4458",          // errors only
  redMute: "#7a2a35",      // muted errors
  redDim: "#5a1a25",       // very dim red borders

  // Greys (sparingly — terminal stays green)
  white: "#e6edf3",        // primary text
  muted: "#7a8a82",        // muted labels
  dim: "#3a4a42",          // very dim — dividers, hints

  // Pure
  black: "#000000",
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
  const glowColor = `#${Math.min(c.r + 60, 255).toString(16).padStart(2, "0")}${Math.min(c.g + 60, 255).toString(16).padStart(2, "0")}${Math.min(c.b + 60, 255).toString(16).padStart(2, "0")}`
  return chalk.hex(glowColor)(text)
}

export function banner(text: string): string {
  const w = process.stdout.columns ?? 80
  const padded = ` ${text} `
  const line = "━".repeat(Math.min(w - 2, padded.length + 10))
  return gradientText(`\n  ${line}\n  ${padded}\n  ${line}`, theme.green, theme.greenGlow)
}

//
// ─── PIXEL WORDMARK ───────────────────────────────────────────────────────────
//
// Bitmap font for short labels (≤ 12 chars). Each glyph is 5 cols × 5 rows.
// Renders solid green main + dim-green drop-shadow offset (+1, +1) for that
// chunky retro look from the reference image.
//
const GLYPHS: Record<string, string[]> = {
  S: [
    " ███ ",
    "█    ",
    " ███ ",
    "    █",
    "███  ",
  ],
  U: [
    "█   █",
    "█   █",
    "█   █",
    "█   █",
    " ███ ",
  ],
  P: [
    "████ ",
    "█   █",
    "████ ",
    "█    ",
    "█    ",
  ],
  E: [
    "█████",
    "█    ",
    "███  ",
    "█    ",
    "█████",
  ],
  R: [
    "████ ",
    "█   █",
    "████ ",
    "█  █ ",
    "█   █",
  ],
  C: [
    " ████",
    "█    ",
    "█    ",
    "█    ",
    " ████",
  ],
  O: [
    " ███ ",
    "█   █",
    "█   █",
    "█   █",
    " ███ ",
  ],
  D: [
    "████ ",
    "█   █",
    "█   █",
    "█   █",
    "████ ",
  ],
  I: [
    "█████",
    "  █  ",
    "  █  ",
    "  █  ",
    "█████",
  ],
  A: [
    " ███ ",
    "█   █",
    "█████",
    "█   █",
    "█   █",
  ],
  M: [
    "█   █",
    "██ ██",
    "█ █ █",
    "█   █",
    "█   █",
  ],
  N: [
    "█   █",
    "██  █",
    "█ █ █",
    "█  ██",
    "█   █",
  ],
  T: [
    "█████",
    "  █  ",
    "  █  ",
    "  █  ",
    "  █  ",
  ],
  L: [
    "█    ",
    "█    ",
    "█    ",
    "█    ",
    "█████",
  ],
  G: [
    " ████",
    "█    ",
    "█  ██",
    "█   █",
    " ████",
  ],
  H: [
    "█   █",
    "█   █",
    "█████",
    "█   █",
    "█   █",
  ],
  V: [
    "█   █",
    "█   █",
    "█   █",
    "█   █",
    " ███ ",
  ],
  W: [
    "█   █",
    "█   █",
    "█ █ █",
    "██ ██",
    "█   █",
  ],
  X: [
    "█   █",
    " █ █ ",
    "  █  ",
    " █ █ ",
    "█   █",
  ],
  Y: [
    "█   █",
    "█   █",
    " █ █ ",
    "  █  ",
    "  █  ",
  ],
  Z: [
    "█████",
    "   █ ",
    "  █  ",
    " █   ",
    "█████",
  ],
  B: [
    "████ ",
    "█   █",
    "████ ",
    "█   █",
    "████ ",
  ],
  F: [
    "█████",
    "█    ",
    "████ ",
    "█    ",
    "█    ",
  ],
  K: [
    "█   █",
    "█  █ ",
    "███  ",
    "█  █ ",
    "█   █",
  ],
  J: [
    "█████",
    "    █",
    "    █",
    "█   █",
    " ███ ",
  ],
  Q: [
    " ███ ",
    "█   █",
    "█   █",
    "█ █ █",
    " ████",
  ],
  "0": [
    " ███ ",
    "█   █",
    "█  ██",
    "█ █ █",
    " ███ ",
  ],
  "1": [
    "  █  ",
    " ██  ",
    "  █  ",
    "  █  ",
    "█████",
  ],
  "2": [
    " ███ ",
    "█   █",
    "   █ ",
    "  █  ",
    "█████",
  ],
  "3": [
    "████ ",
    "    █",
    " ███ ",
    "    █",
    "████ ",
  ],
  ".": [
    "    ",
    "    ",
    "    ",
    "    ",
    "  █ ",
  ],
  "-": [
    "    ",
    "    ",
    "████",
    "    ",
    "    ",
  ],
  _: [
    "    ",
    "    ",
    "    ",
    "    ",
    "████",
  ],
  "/": [
    "    █",
    "   █ ",
    "  █  ",
    " █   ",
    "█    ",
  ],
  " ": [
    "    ",
    "    ",
    "    ",
    "    ",
    "    ",
  ],
}

export function pixelWordmark(text: string, opts?: { color?: string; shadow?: string }): string {
  const main = opts?.color ?? theme.green
  const shadow = opts?.shadow ?? theme.greenDim
  const upper = text.toUpperCase()
  const height = 5

  // Per-letter 5-wide glyph strips; join with 1 space between letters.
  const strips: string[][] = [[], [], [], [], []]
  for (const ch of upper) {
    const glyph = GLYPHS[ch] ?? GLYPHS[" "]!
    for (let r = 0; r < height; r++) {
      const row = glyph[r] ?? "    "
      for (let c = 0; c < 5; c++) {
        strips[r]!.push(row[c] ?? " ")
      }
      strips[r]!.push(" ") // 1-col gap between letters
    }
  }
  // Trim trailing gap from each row
  for (let r = 0; r < height; r++) {
    if (strips[r]!.length && strips[r]![strips[r]!.length - 1] === " ") {
      strips[r]!.pop()
    }
  }
  const width = strips[0]!.length

  // Canvas is height + 1 row (shadow sits one row below main), width + 1 col (shadow sits one col right of main).
  const canvasH = height + 1
  const canvasW = width + 1

  // First pass: paint shadow grid (dim) at offset (+1, +1)
  const shadowGrid: string[][] = []
  for (let r = 0; r < canvasH; r++) {
    shadowGrid.push(new Array(canvasW).fill(" "))
  }
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const ch = strips[r]![c] ?? " "
      if (ch !== " ") shadowGrid[r + 1]![c + 1] = ch
    }
  }
  // Second pass: paint main glyph (bright) — overlays shadow where they overlap
  const mainGrid: string[][] = []
  for (let r = 0; r < canvasH; r++) {
    mainGrid.push(new Array(canvasW).fill(" "))
  }
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const ch = strips[r]![c] ?? " "
      if (ch !== " ") mainGrid[r]![c] = ch
    }
  }

  const out: string[] = []
  for (let r = 0; r < canvasH; r++) {
    let line = ""
    for (let c = 0; c < canvasW; c++) {
      const mainCh = mainGrid[r]![c]!
      const shadowCh = shadowGrid[r]![c]!
      if (mainCh !== " ") {
        line += chalk.hex(main)(mainCh)
      } else if (shadowCh !== " ") {
        line += chalk.hex(shadow)(shadowCh)
      } else {
        line += " "
      }
    }
    out.push(line.replace(/\s+$/, ""))
  }

  return out.join("\n")
}

// Compact single-line bitmap (used in status bars / inline labels)
export function pixelInline(text: string, color = theme.green): string {
  const upper = text.toUpperCase()
  const blocks: string[] = []
  for (const ch of upper) {
    const g = GLYPHS[ch] ?? GLYPHS[" "]!
    // Use the middle row to form a single-line "block letter"
    blocks.push(g[2] ?? "    ")
  }
  return chalk.hex(color)(blocks.join(" "))
}

//
// ─── ASCII FRAME PRIMITIVES ───────────────────────────────────────────────────
//
// Single hard-edged box with optional title centered in the top border.
// Returns a multi-line string. Pure black background, phosphor green border.
//
export function frame(
  content: string,
  opts?: {
    title?: string
    borderColor?: string
    width?: number
    padding?: number
    titleColor?: string
  },
): string {
  const bc = opts?.borderColor ?? theme.green
  const tc = opts?.titleColor ?? theme.green
  const pad = opts?.padding ?? 1
  const termW = process.stdout.columns ?? 80
  const boxW = Math.max(20, Math.min(termW - 2, opts?.width ?? 76))
  const innerW = boxW - 4 // `│ ` left + ` │` right = 4 cols

  // Top border: `┌─ title ─...─┐` filling exactly boxW
  let topBorder: string
  if (opts?.title) {
    const titlePart = `┌─ ${chalk.hex(tc).bold(opts.title)} `
    const titlePartVisible = stripAnsi(titlePart).length
    const topFill = Math.max(0, boxW - titlePartVisible - 1)
    topBorder = chalk.hex(bc)(titlePart) + chalk.hex(bc)("─".repeat(topFill)) + chalk.hex(bc)("┐")
  } else {
    topBorder = chalk.hex(bc)("┌" + "─".repeat(boxW - 2) + "┐")
  }

  const bottomBorder = chalk.hex(bc)("└" + "─".repeat(boxW - 2) + "┘")

  const contentLines = content.split("\n")
  const padded = [
    ...Array(pad).fill(""),
    ...contentLines,
    ...Array(pad).fill(""),
  ]
  const framed = padded
    .map((line) => {
      const visible = stripAnsi(line).length
      const padSpaces = Math.max(0, innerW - visible - 1)
      return `${chalk.hex(bc)("│")} ${line}${" ".repeat(padSpaces)}${chalk.hex(bc)("│")}`
    })
    .join("\n")

  return [topBorder, framed, bottomBorder].join("\n")
}

// Soft panel (boxen-based) for secondary panels
export function panel(content: string, opts?: { title?: string; borderColor?: string }) {
  return boxen(content, {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: 0,
    borderStyle: "single",
    borderColor: opts?.borderColor ?? theme.greenDim,
    title: opts?.title
      ? chalk.hex(theme.green)(` ${opts.title} `)
      : undefined,
    titleAlignment: "left",
    float: "left",
  })
}

// Section divider with section name (RECOMMENDED, PREMIUM, etc.)
export function sectionHeader(label: string, opts?: { accent?: "amber" | "green"; width?: number }): string {
  const w = opts?.width ?? Math.min(process.stdout.columns ?? 80, 80)
  const accent = opts?.accent === "amber" ? theme.amber : theme.green
  const upper = label.toUpperCase()
  const tag = chalk.bgHex(accent).hex(theme.black).bold(` ${upper} `)
  const trail = chalk.hex(theme.greenDim)("─".repeat(Math.max(0, w - upper.length - 4)))
  return `  ${tag} ${trail}`
}

// Single-line card row used inside cardStack — content is just the inner
// text without surrounding `│` rails (the stack adds those).
export function cardRow(opts: {
  label: string
  description?: string
  selected?: boolean
  badge?: "recommended" | "premium" | "unlimited"
}): string {
  const labelColor = opts.selected ? theme.green : theme.greenGlow
  const descColor = opts.selected ? theme.greenMute : theme.muted

  const labelText = opts.selected
    ? chalk.hex(labelColor).bold(opts.label.padEnd(18))
    : chalk.hex(labelColor)(opts.label.padEnd(18))

  const desc = opts.description ? " " + chalk.hex(descColor)(opts.description) : ""

  let badge = ""
  if (opts.badge === "recommended") {
    badge = " " + chalk.bgHex(theme.amber).hex(theme.black).bold(" RECOMMENDED ")
  } else if (opts.badge === "premium") {
    badge = " " + chalk.hex(theme.amber)("[premium]")
  } else if (opts.badge === "unlimited") {
    badge = " " + chalk.hex(theme.greenGlow)("[unlimited]")
  }

  return labelText + desc + badge
}

// Standalone bordered card (used outside cardStack).
export function rowCard(opts: {
  label: string
  description?: string
  selected?: boolean
  badge?: "recommended" | "premium" | "unlimited"
}): string {
  const borderColor = opts.selected ? theme.green : theme.greenDim
  const left = chalk.hex(borderColor)("│")
  const right = chalk.hex(borderColor)("│")
  return `${left} ${cardRow(opts)} ${right}`
}

// Stack multiple cardRow()s inside a single bordered frame.
// Borders align with terminal width; rows are padded internally.
export function cardStack(opts: { rows: string[]; width?: number; title?: string }): string {
  const termW = process.stdout.columns ?? 80
  const boxW = Math.max(20, Math.min(termW - 2, opts.width ?? 76))
  const innerW = boxW - 4 // `│ ` + ` │`

  let top: string
  if (opts.title) {
    const titlePart = `┌─ ${chalk.hex(theme.green).bold(opts.title)} `
    const titlePartVisible = stripAnsi(titlePart).length
    const topFill = Math.max(0, boxW - titlePartVisible - 1)
    top = chalk.hex(theme.green)(titlePart) + chalk.hex(theme.greenDim)("─".repeat(topFill)) + chalk.hex(theme.green)("┐")
  } else {
    top = chalk.hex(theme.green)("┌" + chalk.hex(theme.greenDim)("─".repeat(boxW - 2)) + chalk.hex(theme.green)("┐"))
  }

  const bottom = chalk.hex(theme.green)("└" + chalk.hex(theme.greenDim)("─".repeat(boxW - 2)) + chalk.hex(theme.green)("┘"))

  const body = opts.rows
    .map((row) => {
      const stripped = stripAnsi(row)
      const visibleLen = stripped.length
      const pad = Math.max(0, innerW - visibleLen)
      return `${chalk.hex(theme.greenDim)("│")} ${row}${" ".repeat(pad)} ${chalk.hex(theme.greenDim)("│")}`
    })
    .join("\n")

  return [top, body, bottom].join("\n")
}

//
// ─── SEPARATORS & DIVIDERS ────────────────────────────────────────────────────
//
export function separator(char = "─", color = theme.greenDim): string {
  const width = process.stdout.columns ?? 80
  return chalk.hex(color)(char.repeat(Math.min(width - 1, 80)))
}

export function divider(char = "─", color = theme.greenDim): string {
  return separator(char, color)
}

// Simple double-line full-width divider (used between sections)
export function heavyDivider(): string {
  const w = process.stdout.columns ?? 80
  return chalk.hex(theme.greenDim)("━".repeat(Math.min(w - 1, 80)))
}

//
// ─── LABELS, TAGS, KEY-VALUE ──────────────────────────────────────────────────
//
export function label(text: string, color = theme.greenMute): string {
  return `${chalk.hex(theme.green)("▎")}${chalk.hex(color)(text)}`
}

export function tag(text: string, color = theme.green): string {
  return boxen(chalk.hex(color).bold(text), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    borderStyle: "single",
    borderColor: color,
    dimBorder: true,
    float: "left",
  })
}

export function keyValue(key: string, value: string, keyColor?: string): string {
  return `  ${chalk.hex(keyColor ?? theme.green).bold(key.padEnd(10))} ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.white)(value)}`
}

//
// ─── STEP / STATE PRIMITIVES ──────────────────────────────────────────────────
//
export function step(
  number: number,
  text: string,
  state: "active" | "done" | "pending" | "error" = "pending",
): string {
  const icons = {
    active: chalk.hex(theme.amber)("◉"),
    done: chalk.hex(theme.green)("✓"),
    pending: chalk.hex(theme.greenDim)("○"),
    error: chalk.hex(theme.red)("✕"),
  }
  const colors = {
    active: chalk.hex(theme.amber),
    done: chalk.hex(theme.green),
    pending: chalk.hex(theme.greenMute),
    error: chalk.hex(theme.red),
  }
  return `  ${icons[state]} ${colors[state](`Step ${number}:`)} ${state === "done" ? chalk.hex(theme.greenMute)(text) : colors[state](text)}`
}

export function stepChain(steps: Array<{ number: number; text: string; state: "active" | "done" | "pending" | "error" }>): string {
  return steps
    .map((s, i) => {
      const line = step(s.number, s.text, s.state)
      const isLast = i === steps.length - 1
      const connector = s.state === "done" && !isLast
        ? `  ${chalk.hex(theme.greenDim)("│")}`
        : s.state === "active" && !isLast
          ? `  ${chalk.hex(theme.amber)("│")}`
          : ""
      return connector ? `${line}\n${connector}` : line
    })
    .join("\n")
}

//
// ─── STATUS / PROGRESS / HUD ──────────────────────────────────────────────────
//
export function statusIcon(type: "success" | "error" | "warning" | "info" | "cmd"): string {
  const map = {
    success: chalk.hex(theme.green)("◆"),
    error: chalk.hex(theme.red)("◆"),
    warning: chalk.hex(theme.amber)("◆"),
    info: chalk.hex(theme.greenGlow)("◇"),
    cmd: chalk.hex(theme.amber)("▸"),
  }
  return map[type]
}

export function bullet(text: string, color?: string): string {
  return `  ${chalk.hex(theme.greenDim)("•")} ${chalk.hex(color ?? theme.greenMute)(text)}`
}

export function dimmed(text: string): string {
  return chalk.hex(theme.greenDim)(text)
}

export function progressBar(current: number, total: number, width = 20): string {
  const ratio = Math.min(current / total, 1)
  const filled = Math.round(ratio * width)
  const empty = width - filled
  const bar = [
    chalk.hex(theme.green)("█".repeat(filled)),
    chalk.hex(theme.greenDim)("░".repeat(empty)),
  ].join("")
  const pct = chalk.hex(theme.greenGlow)(`${Math.round(ratio * 100)}%`)
  return `${bar} ${pct}`
}

export function hudPanel(options: {
  label: string
  value: string
  status?: "ok" | "warn" | "err"
  accent?: string
}): string {
  const color = options.accent ?? theme.green
  const statusMap = {
    ok: chalk.hex(theme.green)("●"),
    warn: chalk.hex(theme.amber)("●"),
    err: chalk.hex(theme.red)("●"),
  }
  const statusDot = options.status ? statusMap[options.status] : ""
  const statusPart = statusDot ? ` ${statusDot}` : ""
  return `${chalk.hex(theme.greenDim)("┃")} ${chalk.hex(color).bold(options.label.padEnd(10))} ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.white)(options.value)}${statusPart}`
}

//
// ─── BOTTOM STATUS BAR ────────────────────────────────────────────────────────
//
// Mimics the freebuff footer: bracketed status chips, middot separators,
// file path, line/col counter, mode chip in [BRACKETS]. Always renders to the
// full terminal width with no internal gaps.
//
export function statusBar(opts: {
  left?: string[]
  right?: string[]
}): string {
  const w = process.stdout.columns ?? 80
  const dim = (s: string) => chalk.hex(theme.greenDim)(s)
  const mid = " " + dim("·") + " "

  const leftStr = (opts.left ?? []).join(mid)
  const rightStr = (opts.right ?? []).join(mid)

  const leftVisible = stripAnsi(leftStr).length
  const rightVisible = stripAnsi(rightStr).length
  const fillLen = Math.max(1, w - leftVisible - rightVisible - 3)

  return `${dim("┃")} ${leftStr} ${dim("─".repeat(fillLen))} ${rightStr}`
}

// Standalone two-line status footer (used in chat). Brackets always reach the
// terminal edges; only the inner `─` fill shrinks to make room for content.
export function chatStatusBar(opts: {
  mode: string
  model: string
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
  elapsed?: number
  cumulativeTokens?: number
  contextWindow?: number
  cwd?: string
}) {
  const w = process.stdout.columns ?? 80
  const dim = (s: string) => chalk.hex(theme.greenDim)(s)
  const mid = " " + dim("·") + " "

  const tags: string[] = []
  tags.push(chalk.bgHex(theme.green).hex(theme.black).bold(` ${opts.mode} `))
  tags.push(chalk.hex(theme.greenGlow)(opts.model))

  if (opts.cumulativeTokens !== undefined) {
    const formatted = formatTokenCount(opts.cumulativeTokens)
    if (opts.contextWindow) {
      const pct = Math.min(100, Math.round((opts.cumulativeTokens / opts.contextWindow) * 100))
      tags.push(chalk.hex(theme.amber)(`${formatted} (${pct}%)`))
    } else {
      tags.push(chalk.hex(theme.amber)(formatted))
    }
  } else if (opts.usage) {
    const t = opts.usage.totalTokens ?? (opts.usage.promptTokens ?? 0) + (opts.usage.completionTokens ?? 0)
    tags.push(chalk.hex(theme.amber)(formatTokenCount(t)))
  }
  if (opts.elapsed !== undefined) {
    const time = opts.elapsed < 1000 ? `${opts.elapsed}ms` : `${(opts.elapsed / 1000).toFixed(1)}s`
    tags.push(chalk.hex(theme.greenGlow)(time))
  }

  const inner = tags.join(mid)
  const innerVisible = stripAnsi(inner).length
  const fillLen = Math.max(1, w - innerVisible - 3)

  const line = `${dim("┃")} ${inner} ${dim("─".repeat(fillLen))}`
  console.log(line)
}

//
// ─── PERSISTENT STATUS BAR ────────────────────────────────────────────────────
//
// Single bottom row that anchors the chat session. Renders once, then rewrites
// itself in place when state changes (mode, model, token count). Matches
// OpenCode's "always-there" footer pattern. Reserves one terminal row so the
// prompt always sits directly above it.
//
// Lifecycle:
//   1. `mount()` — reserves the row (print a newline + render first state)
//   2. `update(...)` — overwrites in place via `\r\x1b[K`
//   3. `unmount()` — releases the reserved row
//
const STATUS_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export class PersistentStatusBar {
  private mounted = false
  private state = {
    mode: "chat",
    model: "",
    connectionType: "",
    cumulativeTokens: 0,
    contextWindow: 0,
    elapsed: 0,
    tools: 0,
    isStreaming: false,
    statusMessage: "",
  }
  private lastRow = 0
  private cols = 80
  private spinnerFrame = 0
  private spinnerInterval: ReturnType<typeof setInterval> | null = null

  mount() {
    if (this.mounted) return
    if (!process.stdout.isTTY) {
      // No TTY: skip scroll region trickery, degrade gracefully.
      this.mounted = true
      return
    }
    this.cols = process.stdout.columns ?? 80
    this.lastRow = Math.max(1, (process.stdout.rows ?? 24) - 1)
    // Save cursor, set scroll region to rows [1..lastRow-1], park on status
    // row, render, restore cursor. Standard pinned-status-row pattern (tmux).
    process.stdout.write("\x1b7")
    process.stdout.write(`\x1b[1;${this.lastRow}r`)
    process.stdout.write(`\x1b[${this.lastRow + 1};1H`)
    this.renderLine()
    process.stdout.write("\x1b8")
    this.mounted = true
  }

  private startSpinner() {
    this.stopSpinner()
    this.spinnerInterval = setInterval(() => {
      this.spinnerFrame = (this.spinnerFrame + 1) % STATUS_SPINNER_FRAMES.length
      if (!this.mounted) return
      process.stdout.write("\x1b7")
      process.stdout.write(`\x1b[${this.lastRow + 1};1H`)
      this.renderLine()
      process.stdout.write("\x1b8")
    }, 120)
  }

  private stopSpinner() {
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval)
      this.spinnerInterval = null
    }
  }

  unmount() {
    this.stopSpinner()
    if (!this.mounted) return
    this.mounted = false
    if (!process.stdout.isTTY) return
    // Restore full-screen scroll region; the status row stays visible as scrollback.
    process.stdout.write("\x1b7")
    process.stdout.write("\x1b[r")
    process.stdout.write("\x1b8")
  }

  // Surrender the status row briefly (e.g. when input prompt needs to redraw).
  pause() {
    if (!this.mounted || !process.stdout.isTTY) return
    process.stdout.write("\x1b7")
    process.stdout.write("\x1b[r")
    process.stdout.write(`\x1b[${this.lastRow + 1};1H`)
    process.stdout.write("\x1b[K")
    process.stdout.write("\x1b8")
  }

  resume() {
    if (!this.mounted || !process.stdout.isTTY) return
    process.stdout.write("\x1b7")
    process.stdout.write(`\x1b[1;${this.lastRow}r`)
    process.stdout.write(`\x1b[${this.lastRow + 1};1H`)
    this.renderLine()
    process.stdout.write("\x1b8")
  }

  update(partial: Partial<typeof this.state>) {
    const prevStreaming = this.state.isStreaming
    this.state = { ...this.state, ...partial }
    if (partial.isStreaming !== undefined && partial.isStreaming !== prevStreaming) {
      if (partial.isStreaming) this.startSpinner()
      else this.stopSpinner()
    }
    if (!this.mounted) return
    if (!process.stdout.isTTY) return
    process.stdout.write("\x1b7")
    process.stdout.write(`\x1b[${this.lastRow + 1};1H`)
    this.renderLine()
    process.stdout.write("\x1b8")
  }

  setMode(mode: string) {
    this.update({ mode })
  }

  setModel(model: string) {
    this.update({ model })
  }

  setConnectionType(type: string) {
    this.update({ connectionType: type })
  }

  setStreaming(streaming: boolean) {
    this.update({ isStreaming: streaming })
  }

  addTokens(delta: number) {
    this.update({ cumulativeTokens: this.state.cumulativeTokens + delta })
  }

  setTokens(total: number) {
    this.update({ cumulativeTokens: total })
  }

  setElapsed(ms: number) {
    this.update({ elapsed: ms })
  }

  setContextWindow(n: number) {
    this.update({ contextWindow: n })
  }

  incTools(delta = 1) {
    this.update({ tools: this.state.tools + delta })
  }

  resetTools() {
    this.update({ tools: 0 })
  }

  setStatusMessage(msg: string) {
    this.update({ statusMessage: msg })
  }

  renderLine() {
    process.stdout.write("\x1b[2K")
    const leftBorder = ansiColor(theme.greenDim, "┃")

    if (this.state.statusMessage) {
      const msg = ansiColor(theme.greenGlow, this.state.statusMessage)
      const remaining = Math.max(1, this.cols - 4)
      const fillLine = ansiColor(theme.greenDim, "─".repeat(Math.max(1, this.cols - stripAnsi(msg).length - 4)))
      process.stdout.write(`${leftBorder} ${msg} ${fillLine}`)
      return
    }

    const sep = " " + ansiColor(theme.greenDim, "·") + " "
    const parts: string[] = []
    parts.push(
      `\x1b[7;${ansiFg(theme.green)};${ansiBg(theme.black)}m ${this.state.mode} \x1b[0m`,
    )
    if (this.state.isStreaming) {
      const frame = STATUS_SPINNER_FRAMES[this.spinnerFrame] ?? "⠋"
      parts.push(ansiColor(theme.greenGlow, frame))
    }
    if (this.state.model) parts.push(ansiColor(theme.greenGlow, this.state.model))
    if (this.state.connectionType === "direct") {
      parts.push(ansiColor(theme.amber, "🔑"))
    } else if (this.state.connectionType === "proxy") {
      parts.push(ansiColor(theme.amber, "☁️"))
    }

    if (this.state.cumulativeTokens > 0) {
      const formatted = formatTokenCount(this.state.cumulativeTokens)
      if (this.state.contextWindow > 0) {
        const pct = Math.min(
          100,
          Math.round((this.state.cumulativeTokens / this.state.contextWindow) * 100),
        )
        const color = pct > 80 ? theme.red : theme.amber
        parts.push(ansiColor(color, `${formatted} (${pct}%)`))
      } else {
        parts.push(ansiColor(theme.amber, formatted))
      }
    }

    if (this.state.tools > 0) {
      parts.push(ansiColor(theme.greenDim, `${this.state.tools} tools`))
    }

    if (this.state.isStreaming && this.state.elapsed > 0) {
      const time =
        this.state.elapsed < 1000
          ? `${this.state.elapsed}ms`
          : `${(this.state.elapsed / 1000).toFixed(1)}s`
      parts.push(ansiColor(theme.greenGlow, time))
    }

    parts.push(
      this.state.isStreaming
        ? ansiColor(theme.greenDim, "esc interrupt")
        : ansiColor(theme.greenDim, "tab mode"),
    )

    const inner = parts.join(sep)
    const innerLen = stripAnsi(inner).length
    const fill = Math.max(1, this.cols - innerLen - 3)
    const fillLine = ansiColor(theme.greenDim, "─".repeat(fill))

    process.stdout.write(`${leftBorder} ${inner} ${fillLine}`)
  }
}

function ansiColor(hex: string, text: string): string {
  return `\x1b[38;2;${hexToAnsiRgb(hex)}m${text}\x1b[0m`
}
function ansiFg(hex: string): string {
  return `38;2;${hexToAnsiRgb(hex)}`
}
function ansiBg(hex: string): string {
  return `48;2;${hexToAnsiRgb(hex)}`
}
function hexToAnsiRgb(hex: string): string {
  const h = hex.replace("#", "")
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r};${g};${b}`
}

//
// ─── HEADINGS / MESSAGES ──────────────────────────────────────────────────────
//
export function heading(text: string): string {
  return `${chalk.hex(theme.green)("┃")} ${chalk.hex(theme.white).bold(text)}`
}

// Section heading with double-line frame above and below
export function sectionHeading(text: string): string {
  const w = process.stdout.columns ?? 80
  const innerW = w - 4
  const pad = Math.max(0, Math.floor((innerW - text.length) / 2))
  return [
    chalk.hex(theme.greenDim)("━".repeat(w - 1)),
    `  ${chalk.hex(theme.green)("┃")} ${chalk.hex(theme.greenGlow).bold(text)} ${chalk.hex(theme.green)("┃")}`,
    chalk.hex(theme.greenDim)("━".repeat(w - 1)),
  ].join("\n")
}

import { highlightCode } from "./code-highlighter"

// ... (preserving all other imports above)

export function codeBlock(code: string, language?: string): string {
  const lines = code.split("\n")
  const lang = language ?? "ts"
  const header = language ? ` ${chalk.hex(theme.amber)(language)} ` : ""
  const wrapped = lines
    .map((line) => `  ${highlightLine(line, lang)}`)
    .join("\n")
  return boxen(header + "\n" + wrapped, {
    padding: { top: 0, bottom: 0, left: 2, right: 2 },
    margin: 0,
    borderStyle: "single",
    borderColor: theme.greenDim,
    dimBorder: true,
    float: "left",
  })
}

export function successBox(message: string, subtitle?: string): string {
  return boxen(
    [
      `  ${chalk.hex(theme.green)("◆")}  ${chalk.hex(theme.green).bold(message)}`,
      ...(subtitle ? [`     ${chalk.hex(theme.greenMute)(subtitle)}`] : []),
    ].join("\n"),
    {
      padding: { top: 0, bottom: 0, left: 2, right: 2 },
      margin: 0,
      borderStyle: "single",
      borderColor: theme.greenDim,
      float: "left",
    },
  )
}

export function errorBox(message: string): string {
  return boxen(
    `  ${chalk.hex(theme.red)("◆")}  ${chalk.hex(theme.red).bold(message)}`,
    {
      padding: { top: 0, bottom: 0, left: 2, right: 2 },
      margin: 0,
      borderStyle: "single",
      borderColor: theme.red,
      float: "left",
    },
  )
}

export function infoBox(message: string): string {
  return boxen(
    `  ${chalk.hex(theme.greenGlow)("◇")}  ${chalk.hex(theme.greenMute)(message)}`,
    {
      padding: { top: 0, bottom: 0, left: 2, right: 2 },
      margin: 0,
      borderStyle: "single",
      borderColor: theme.greenDim,
      dimBorder: true,
      float: "left",
    },
  )
}

//
// ─── SPINNERS / PROGRESS ──────────────────────────────────────────────────────
//
export function createSpinner(text: string) {
  return yoctoSpinner({
    text: chalk.hex(theme.greenMute)(text),
    color: "green",
  })
}

// Block-cursor caret used in the input prompt (amber, half-block style)
export const CARET = "▌"
export const ARROW = "▸"

// Persistent thinking display with frames that look like phosphor scan
const THINKING_FRAMES = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"]

export function createThinking(label = "thinking"): { stop: () => void; succeed: (text?: string) => void; fail: (text?: string) => void; setLabel: (text: string) => void } {
  let i = 0
  let running = true
  let currentLabel = label
  const id = setInterval(() => {
    if (!running) return
    process.stdout.write(`\r${chalk.hex(theme.amber)(THINKING_FRAMES[i])} ${chalk.hex(theme.greenMute)(currentLabel)}`)
    i = (i + 1) % THINKING_FRAMES.length
  }, 80)

  function clear() {
    readline.clearLine(process.stdout, 0)
    readline.cursorTo(process.stdout, 0)
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
      if (text) console.log(` ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.greenMute)(text)}`)
    },
    fail: (text?: string) => {
      running = false
      clearInterval(id)
      clear()
      if (text) console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(text)}`)
    },
    setLabel: (text: string) => {
      currentLabel = text
    },
  }
}

//
// ─── CHAT-SPECIFIC BLOCKS ─────────────────────────────────────────────────────
//
export type MessageRole = "user" | "assistant" | "system"

export function messageBlock(content: string, opts?: { role?: MessageRole; title?: string; compact?: boolean }) {
  const role = opts?.role ?? "assistant"
  const color = role === "user" ? theme.greenGlow : role === "system" ? theme.amber : theme.green
  const defaultTitle = role === "user" ? "you" : "supercode"
  const title = opts?.title ?? defaultTitle
  const lines = content.split("\n")
  const w = process.stdout.columns ?? 80
  // Total visible width of the box: terminal width, with a small right margin.
  const boxW = Math.max(20, w - 2)
  const innerW = boxW - 4 // `┃ ` left + ` ┃` right = 4 cols

  // Top border: `┏━ title ─...─┓` filling exactly the box width
  const titlePart = `┏━ ${chalk.hex(color).bold(title)} `
  const titlePartVisible = stripAnsi(titlePart).length
  const topFill = Math.max(0, boxW - titlePartVisible - 1) // -1 for trailing ┓
  const top = chalk.hex(color)(titlePart) + chalk.hex(color)("─".repeat(topFill)) + chalk.hex(color)("┓")

  // Body: each line gets `┃ ` prefix and is padded to innerW, then ` ┃`
  const body = opts?.compact
    ? lines.slice(0, 3).map((l) => {
        const visible = l.length
        const pad = Math.max(0, innerW - visible)
        return `${chalk.hex(color)("┃")} ${l}${" ".repeat(pad)} ${chalk.hex(color)("┃")}`
      }).join("\n") + (lines.length > 3 ? `\n${chalk.hex(color)("┃")} ${" ".repeat(innerW - 2)} ${chalk.hex(color)("┃")}\n${chalk.hex(color)("┃")} ${chalk.hex(theme.greenMute)(`... +${lines.length - 3} more lines`).padEnd(innerW - 2)} ${chalk.hex(color)("┃")}` : "")
    : lines.map((l) => {
        const visible = stripAnsi(l).length
        const pad = Math.max(0, innerW - visible - 1)
        return `${chalk.hex(color)("┃")} ${l}${" ".repeat(pad)}${chalk.hex(color)("┃")}`
      }).join("\n")

  const bottom = chalk.hex(theme.greenDim)("┗" + "─".repeat(boxW - 2) + "┛")

  return [top, body, bottom].join("\n")
}

export function streamHeader(model: string, label = "supercode") {
  const dim = (s: string) => chalk.hex(theme.greenDim)(s)
  // Single-line assistant header. Just label · model — the timestamp was
  // decorative noise that didn't earn its place.
  const title = `${chalk.hex(theme.green).bold(label)} ${dim("·")} ${chalk.hex(theme.greenGlow)(model)}`
  console.log(` ${chalk.hex(theme.green)("┃")} ${title}`)
}

export function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

export function streamFooter(usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }, elapsedMs?: number, model?: string) {
  const parts: string[] = []
  if (usage && (usage.totalTokens || usage.promptTokens || usage.completionTokens)) {
    const t = usage.totalTokens ?? (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0)
    parts.push(`${formatTokenCount(t)}`)
  }
  if (elapsedMs !== undefined) {
    const time = elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`
    parts.push(time)
  }
  if (model) parts.push(model)
  const meta = parts.length > 0 ? ` ${chalk.hex(theme.greenMute)(parts.join(" · "))}` : ""

  const w = process.stdout.columns ?? 80
  const dim = (s: string) => chalk.hex(theme.greenDim)(s)
  const fill = Math.max(0, w - stripAnsi(meta).length - 2)
  console.log(`${dim("└")}${dim("─".repeat(fill))}${meta}`)
}

export function responseDivider() {
  const w = process.stdout.columns ?? 80
  console.log(chalk.hex(theme.greenDim)(` ${"─".repeat(Math.max(0, w - 2))}`))
}

export function streamingLine(text: string) {
  process.stdout.write(`${chalk.hex(theme.green)("┃")} ${text}`)
}

export function userMessage(content: string) {
  const lines = content.split("\n")
  const arrow = chalk.hex(theme.amber)("▌")
  const label = chalk.hex(theme.greenGlow).bold("you")
  const indent = "  "
  for (let i = 0; i < lines.length; i++) {
    if (i === 0) {
      console.log(`${arrow} ${label} ${chalk.hex(theme.greenMute)(">")} ${lines[i]}`)
    } else {
      console.log(`${indent}${chalk.hex(theme.greenMute)(lines[i])}`)
    }
  }
  console.log()
}

export function compactMessageSummary(role: string, content: string, index: number) {
  const color = role === "user" ? theme.greenGlow : theme.green
  const firstLine = content.split("\n")[0] ?? ""
  const truncated = firstLine.length > 72 ? firstLine.slice(0, 69) + "..." : firstLine
  console.log(` ${chalk.hex(theme.greenDim)(`${String(index).padStart(3)}.`)} ${chalk.hex(color)("─")} ${chalk.hex(theme.greenMute)(truncated)}`)
}

export function sessionSummary(conversation: { id: string; title: string | null; mode: string; createdAt: Date; messages?: { role: string }[] }) {
  const msgCount = conversation.messages?.length ?? 0
  const title = conversation.title ?? "Untitled"
  const date = conversation.createdAt.toLocaleDateString()
  return panel(
    [
      `  ${chalk.hex(theme.green).bold(title)}`,
      `  ${chalk.hex(theme.greenMute)(`${msgCount} messages · ${date} · ${conversation.mode}`)}`,
      `  ${chalk.hex(theme.greenDim)(conversation.id)}`,
    ].join("\n"),
    { title: "session", borderColor: theme.greenDim },
  )
}

export function chatHelp() {
  const lines = [
    ` ${chalk.hex(theme.amber)("Enter")}     send message`,
    ` ${chalk.hex(theme.amber)("Esc")}      clear input / cancel response`,
    ` ${chalk.hex(theme.amber)("Tab")}      cycle mode · ${chalk.hex(theme.greenGlow)("[chat] [agent]")}`,
    ` ${chalk.hex(theme.amber)("↑/↓")}     navigate history`,
    ` ${chalk.hex(theme.amber)("Ctrl+C")}   exit`,
  ]
  return panel(lines.join("\n"), { title: "keys", borderColor: theme.greenDim })
}

export function systemLine(text: string): string {
  const ts = chalk.hex(theme.greenDim)(new Date().toLocaleTimeString())
  return `${chalk.hex(theme.greenDim)("[")}${ts}${chalk.hex(theme.greenDim)("]")} ${chalk.hex(theme.greenMute)(text)}`
}

export function ornamentalDivider(width?: number): string {
  const w = width ?? Math.min(process.stdout.columns ?? 80, 60)
  const left = chalk.hex(theme.green)("▓▓")
  const mid = chalk.hex(theme.greenDim)("▒".repeat(Math.max(0, w - 6)))
  const right = chalk.hex(theme.green)("▓▓")
  return `${left}${mid}${right}`
}

//
// ─── ANSI STRIPPING ───────────────────────────────────────────────────────────
//
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "")
}

//
// ─── TABLE ────────────────────────────────────────────────────────────────────
//
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
    .map((h, i) => ` ${chalk.hex(theme.green).bold(h.padEnd(gw(i)))} `)
    .join("│")
  const separatorLine = chalk.hex(theme.greenDim)(hr)
  const bodyLines = rows.map((row) =>
    row
      .map((cell, i) => ` ${chalk.hex(theme.greenGlow)(cell.padEnd(gw(i)))} `)
      .join("│"),
  )

  return [
    chalk.hex(theme.greenDim)(`┌${colWidths.map((_, i) => "─".repeat(gw(i) + 2)).join("┬")}┐`),
    `│${headerLine}│`,
    separatorLine,
    ...bodyLines.map((l) => `│${l}│`),
    chalk.hex(theme.greenDim)(`└${colWidths.map((_, i) => "─".repeat(gw(i) + 2)).join("┴")}┘`),
  ].join("\n")
}

//
// ─── TIMING ───────────────────────────────────────────────────────────────────
//
export function timediff(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

//
// ─── STREAM RENDERER ──────────────────────────────────────────────────────────
//
// Inline marked-terminal renderer wrapper that respects our palette overrides.
// Used to render markdown AI responses in green.
//
export function streamChunk(chunk: string) {
  // Just emit raw — downstream can pipe through marked-terminal if desired.
  process.stdout.write(chunk)
}

// NOTE: fileViewer utilities live in ./fileViewer — import directly
// (avoiding circular dependency since fileViewer imports theme from here)
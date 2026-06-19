import chalk from "chalk"
import { theme } from "src/cli/utils/tui"

const SPINNER_FRAMES = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"]

export function reasoningSummary(text: string) {
  const content = text.trim()
  const match = content.match(/^\*\*([^*\n]+)\*\*(?:\r?\n\r?\n|$)/)
  if (!match || !match[1]) return { title: null, body: content }
  return { title: match[1].trim(), body: content.slice(match[0]!.length).trimEnd() }
}

const TOOL_ICONS: Record<string, string> = {
  run_command: "▸",
  read_file: "←",
  write_file: "→",
  edit_file: "→",
  glob: "✦",
  grep: "✦",
  webfetch: "%",
  websearch: "◆",
  task: "✓",
  question: "?",
  skill: "⚙",
  apply_patch: "→",
}

export function getToolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] || "⚙"
}

export class ThinkingDisplay {
  private i = 0
  private intervalId: ReturnType<typeof setInterval> | null = null
  private currentLabel = ""
  private running = false

  start(label: string) {
    this.currentLabel = label
    if (this.running) return
    this.running = true
    this.i = 0
    this.intervalId = setInterval(() => {
      if (!this.running) return
      process.stdout.write(`\r${chalk.hex(theme.amber)(SPINNER_FRAMES[this.i])} ${chalk.hex(theme.greenMute)(this.currentLabel)}`)
      this.i = (this.i + 1) % SPINNER_FRAMES.length
    }, 80)
  }

  setLabel(label: string) {
    this.currentLabel = label
    if (this.running) {
      process.stdout.write(`\r${chalk.hex(theme.amber)(SPINNER_FRAMES[this.i])} ${chalk.hex(theme.greenMute)(label)}`)
    }
  }

  stop() {
    this.running = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    process.stdout.write("\r\n")
  }

  succeed(text?: string) {
    this.stop()
    if (text) console.log(` ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.greenMute)(text)}`)
  }

  fail(text?: string) {
    this.stop()
    if (text) console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(text)}`)
  }

  showToolCall(toolName: string) {
    this.stop()
    const icon = getToolIcon(toolName)
    const line = ` ${chalk.hex(theme.amber)(icon)} ${chalk.hex(theme.greenGlow).bold(toolName)}`
    process.stdout.write(line + "\n")
  }

  showReasoning(content: string) {
    const summary = reasoningSummary(content)
    const title = summary.title || "thinking"
    if (!this.running) this.start(`think: ${title}`)
    else this.setLabel(`think: ${title}`)
  }
}
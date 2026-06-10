import chalk from "chalk"
import { theme } from "src/cli/utils/tui"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function reasoningSummary(text: string) {
  const content = text.trim()
  const match = content.match(/^\*\*([^*\n]+)\*\*(?:\r?\n\r?\n|$)/)
  if (!match || !match[1]) return { title: null, body: content }
  return { title: match[1].trim(), body: content.slice(match[0]!.length).trimEnd() }
}

const TOOL_ICONS: Record<string, string> = {
  run_command: "\u25B8",
  read_file: "\u2192",
  write_file: "\u2190",
  edit_file: "\u2190",
  glob: "\u2731",
  grep: "\u2731",
  webfetch: "%",
  websearch: "\u25C6",
  task: "\u2713",
  question: "?",
  skill: "\u2699",
  apply_patch: "\u2190",
}

export function getToolIcon(toolName: string): string {
  return TOOL_ICONS[toolName] || "\u2699"
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
      process.stdout.write(`\r${chalk.hex(theme.cyan)(SPINNER_FRAMES[this.i])} ${chalk.hex(theme.muted)(this.currentLabel)}`)
      this.i = (this.i + 1) % SPINNER_FRAMES.length
    }, 80)
  }

  setLabel(label: string) {
    this.currentLabel = label
    if (this.running) {
      process.stdout.write(`\r${chalk.hex(theme.cyan)(SPINNER_FRAMES[this.i])} ${chalk.hex(theme.muted)(label)}`)
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
    if (text) console.log(` ${chalk.hex(theme.green)("\u25C6")} ${chalk.hex(theme.muted)(text)}`)
  }

  fail(text?: string) {
    this.stop()
    if (text) console.log(` ${chalk.hex(theme.red)("\u25C6")} ${chalk.hex(theme.red)(text)}`)
  }

  showToolCall(toolName: string) {
    this.stop()
    const icon = getToolIcon(toolName)
    const line = ` ${chalk.hex(theme.cyan)(icon)} ${chalk.hex(theme.muted)(toolName)}`
    process.stdout.write(line + "\n")
  }

  showReasoning(content: string) {
    const summary = reasoningSummary(content)
    const title = summary.title || "thinking"
    if (!this.running) this.start(`think: ${title}`)
    else this.setLabel(`think: ${title}`)
  }
}

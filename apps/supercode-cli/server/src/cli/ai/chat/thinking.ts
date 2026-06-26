import chalk from "chalk"
import { theme, stripAnsi } from "src/cli/utils/tui"

const SPINNER_FRAMES = ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█"]
const BG_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]
const DOTS = ["", "·", "··", "···"]

export function reasoningSummary(text: string) {
  const content = text.trim()
  const match = content.match(/^\*\*([^*\n]+)\*\*(?:\r?\n\r?\n|$)/)
  if (!match || !match[1]) return { title: null, body: content }
  return { title: match[1].trim(), body: content.slice(match[0]!.length).trimEnd() }
}


export function toolLabel(toolName: string): string {
  return ` ${chalk.hex(theme.amber)("%")} ${chalk.hex(theme.greenGlow)(toolName)}`
}

export class ThinkingDisplay {
  private i = 0
  private intervalId: ReturnType<typeof setInterval> | null = null
  private currentLabel = ""
  private running = false
  private dotsIdx = 0
  private dotsInterval: ReturnType<typeof setInterval> | null = null

  start(label: string) {
    this.currentLabel = label
    if (this.running) return
    this.running = true
    this.i = 0
    this.dotsIdx = 0

    this.intervalId = setInterval(() => {
      if (!this.running) return
      process.stdout.write(
        `\r${chalk.hex(theme.amber)(SPINNER_FRAMES[this.i])} ${chalk.hex(theme.greenMute)(this.currentLabel)}`,
      )
      this.i = (this.i + 1) % SPINNER_FRAMES.length
    }, 80)

    this.dotsInterval = setInterval(() => {
      if (!this.running) return
      this.dotsIdx = (this.dotsIdx + 1) % DOTS.length
    }, 400)
  }

  setLabel(label: string) {
    this.currentLabel = label
    if (this.running) {
      process.stdout.write(
        `\r${chalk.hex(theme.amber)(SPINNER_FRAMES[this.i])} ${chalk.hex(theme.greenMute)(label)}`,
      )
    }
  }

  stop() {
    this.running = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.dotsInterval) {
      clearInterval(this.dotsInterval)
      this.dotsInterval = null
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
    if (this.running) {
      this.running = false
      if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
      if (this.dotsInterval) { clearInterval(this.dotsInterval); this.dotsInterval = null }
      process.stdout.write("\r\x1b[K")
    }
    console.log(toolLabel(toolName))
  }

  showReasoning(content: string) {
    const summary = reasoningSummary(content)
    const title = summary.title || "thinking"
    if (!this.running) {
      this.start(`think: ${title}`)
    } else {
      this.setLabel(`think: ${title}`)
    }
  }
}

//
// ─── AGENT BACKGROUND STATUS ──────────────────────────────────────────────────
//
// Persistent compact status line for ongoing agent/chat operations.
// Shows model, elapsed time, current tool, and step count in a single
// terminal line that gets refreshed in-place.
//
export class AgentStatusDisplay {
  private startTime = 0
  private elapsedInterval: ReturnType<typeof setInterval> | null = null
  private renderInterval: ReturnType<typeof setInterval> | null = null
  private frameIndex = 0
  private running = false
  private model = ""
  private currentTool = ""
  private stepCount = 0
  private toolHistory: string[] = []
  private foldToolHistory = false

  start(model: string) {
    this.startTime = Date.now()
    this.model = model
    this.currentTool = ""
    this.stepCount = 0
    this.toolHistory = []
    this.foldToolHistory = false
    if (this.running) return
    this.running = true
    this.frameIndex = 0
    this.render()

    this.elapsedInterval = setInterval(() => {
      if (!this.running) return
      this.render()
    }, 1000)

    this.renderInterval = setInterval(() => {
      if (!this.running) return
      this.frameIndex = (this.frameIndex + 1) % BG_FRAMES.length
      this.render()
    }, 100)
  }

  setTool(toolName: string) {
    this.currentTool = toolName
    // Track unique consecutive tool calls
    const last = this.toolHistory[this.toolHistory.length - 1]
    if (last !== toolName) {
      this.toolHistory.push(toolName)
    }
    this.stepCount++
    if (this.running) this.render()
  }

  stop() {
    this.running = false
    if (this.elapsedInterval) {
      clearInterval(this.elapsedInterval)
      this.elapsedInterval = null
    }
    if (this.renderInterval) {
      clearInterval(this.renderInterval)
      this.renderInterval = null
    }
    this.clear()
  }

  private elapsed(): string {
    if (!this.startTime) return "0s"
    const ms = Date.now() - this.startTime
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    const m = Math.floor(ms / 60000)
    const s = Math.round((ms % 60000) / 1000)
    return `${m}m ${s}s`
  }

  private render() {
    const frame = BG_FRAMES[this.frameIndex]
    const spinner = chalk.hex(theme.amber)(frame)
    const modelStr = chalk.hex(theme.greenGlow)(this.model)
    const elapsed = chalk.hex(theme.greenMute)(this.elapsed())
    const tool = this.currentTool
      ? `${chalk.hex(theme.greenDim)("·")} ${toolLabel(this.currentTool)}`
      : ""
    const count = this.stepCount > 0
      ? `${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenMute)(`${this.stepCount}`)}`
      : ""

    process.stdout.write(
      `\r${spinner} ${modelStr} ${chalk.hex(theme.greenDim)("·")} ${elapsed} ${tool} ${count}`,
    )
  }

  private clear() {
    process.stdout.write("\r")
    const cols = process.stdout.columns ?? 80
    process.stdout.write(" ".repeat(cols - 1))
    process.stdout.write("\r")
  }

  succeed(text?: string) {
    this.stop()
    if (text) console.log(` ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.greenMute)(text)}`)
  }

  fail(text?: string) {
    this.stop()
    if (text) console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(text)}`)
  }
}

//
// ─── TOOL CALL GROUP ──────────────────────────────────────────────────────────
//
// Groups consecutive tool calls of the same type for a cleaner display.
// Instead of printing each tool call on its own line, related calls are
// grouped with a count badge.
//
export function formatToolGroup(toolName: string, count: number): string {
  const label = chalk.hex(theme.greenGlow)(toolName)
  if (count <= 1) return ` ${chalk.hex(theme.amber)("%")} ${label}`
  return ` ${chalk.hex(theme.amber)("%")} ${label} ${chalk.hex(theme.greenMute)(`×${count}`)}`
}

export function showToolSequence(toolCalls: string[]) {
  if (toolCalls.length === 0) return
  const groups: Array<{ name: string; count: number }> = []
  for (const name of toolCalls) {
    const last = groups[groups.length - 1]
    if (last && last.name === name) {
      last.count++
    } else {
      groups.push({ name, count: 1 })
    }
  }
  for (const g of groups) {
    console.log(formatToolGroup(g.name, g.count))
  }
}

//
// ─── THOUGHT CHAIN ────────────────────────────────────────────────────────────
//
// Tracks and renders the agent's internal reasoning steps with timing and
// tool calls. Each thought is a single reasoning + tool-use unit that the
// agent performs before producing output.
//
// Visual format (expanded):
//   ┃ ▼ Thought: 379ms
//   ┃   The user wants to review footer.tsx...
//   ┃   → Read apps/web/components/homepage/footer.tsx
//
// Collapsed (only the header):
//   ┃ ▶ Thought: 379ms
//
export interface ThoughtTool {
  name: string
  args?: string
}

export interface ThoughtEntry {
  body: string
  tools: ThoughtTool[]
  startTime: number
  endTime: number | null
  collapsed: boolean
}

export class ThoughtChain {
  thoughts: ThoughtEntry[] = []
  private current: ThoughtEntry | null = null

  begin(): ThoughtEntry {
    if (this.current) this.finish()
    const entry: ThoughtEntry = {
      body: "",
      tools: [],
      startTime: Date.now(),
      endTime: null,
      collapsed: false,
    }
    this.thoughts.push(entry)
    this.current = entry
    return entry
  }

  append(text: string) {
    if (!this.current) this.begin()
    if (this.current) {
      this.current.body += text
    }
  }

  addTool(name: string, args?: string) {
    if (!this.current && this.thoughts.length > 0) {
      this.current = this.thoughts[this.thoughts.length - 1]!
    }
    if (!this.current) {
      const entry = this.begin()
      entry.tools.push({ name, args })
      return
    }
    const lastTool = this.current.tools[this.current.tools.length - 1]
    if (lastTool && lastTool.name === name && !lastTool.args) {
      // Deduplicate consecutive same-named bare tool calls
      return
    }
    this.current.tools.push({ name, args })
  }

  finish() {
    if (this.current) {
      this.current.endTime = Date.now()
      this.current = null
    }
  }

  get elapsed(): number {
    if (this.thoughts.length === 0) return 0
    const first = this.thoughts[0]!
    const last = this.thoughts[this.thoughts.length - 1]!
    return (last.endTime ?? Date.now()) - first.startTime
  }

  toggle(index: number) {
    const thought = this.thoughts[index]
    if (thought) thought.collapsed = !thought.collapsed
  }

  collapseAll() {
    for (const t of this.thoughts) t.collapsed = true
  }

  expandAll() {
    for (const t of this.thoughts) t.collapsed = false
  }

  renderThought(entry: ThoughtEntry, index?: number): string {
    const elapsed = entry.endTime
      ? `${entry.endTime - entry.startTime}ms`
      : `${Date.now() - entry.startTime}ms (in progress)`

    const toggleIcon = entry.collapsed
      ? chalk.hex(theme.greenDim)("▶")
      : chalk.hex(theme.greenDim)("▼")
    const header = `${toggleIcon} ${chalk.hex(theme.greenMute)("Thought")}${chalk.hex(theme.greenDim)(":")} ${chalk.hex(theme.greenGlow)(elapsed)}`
    const prefix = chalk.hex(theme.greenDim)("┃")
    const indent = chalk.hex(theme.greenDim)("┃")

    const lines: string[] = []

    if (entry.collapsed) {
      lines.push(`${indent} ${header}`)
      return lines.join("\n")
    }

    // Header line
    lines.push(`${indent} ${header}`)

    // Body lines — wrap reasoning text, indent under the header
    const bodyLines = entry.body.trim().split("\n")
    for (const bl of bodyLines) {
      const trimmed = bl.trim()
      if (trimmed) {
        lines.push(`${indent}   ${chalk.hex(theme.greenMute)(trimmed)}`)
      }
    }

    // Tool calls made during this thought
    if (entry.tools.length > 0) {
      const grouped = this.groupTools(entry.tools)
      for (const [toolName, count] of grouped) {
        const name = toolName
        if (count <= 1) {
          lines.push(`${indent}   ${chalk.hex(theme.amber)("%")} ${chalk.hex(theme.greenGlow)(name)}`)
        } else {
          lines.push(`${indent}   ${chalk.hex(theme.amber)("%")} ${chalk.hex(theme.greenGlow)(name)} ${chalk.hex(theme.greenMute)(`×${count}`)}`)
        }
      }
    }

    return lines.join("\n")
  }

  private groupTools(tools: ThoughtTool[]): Array<[string, number]> {
    const groups: Array<[string, number]> = []
    for (const t of tools) {
      const last = groups[groups.length - 1]
      if (last && last[0] === t.name) {
        last[1]++
      } else {
        groups.push([t.name, 1])
      }
    }
    return groups
  }

  renderAll(opts?: { collapseAfter?: number }): string {
    if (this.thoughts.length === 0) return ""

    // auto-collapse all thoughts after N seconds
    if (opts?.collapseAfter !== undefined) {
      const cutoff = Date.now() - opts.collapseAfter * 1000
      for (const t of this.thoughts) {
        if (t.endTime && t.endTime < cutoff) {
          t.collapsed = true
        }
      }
    }

    const rendered = this.thoughts.map((t, i) => this.renderThought(t, i))
    return rendered.join("\n")
  }

  printAll(opts?: { collapseAfter?: number }) {
    const out = this.renderAll(opts)
    if (out) console.log(out)
  }

  reset() {
    this.thoughts = []
    this.current = null
  }
}

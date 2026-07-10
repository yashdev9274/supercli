import chalk from "chalk"
import { theme } from "src/cli/utils/tui"

//
// ─── STEP STATUS ROW ──────────────────────────────────────────────────────────
//
// Single-row live status indicator that sits directly above the input prompt.
// Mirrors OpenCode's "▣ Build · DeepSeek V4 Flash Free" pattern.
//
// Lifecycle:
//   1. `start(agentName, modelName)` — mount the row.
//   2. `setPhase("thinking" | "tool" | "streaming" | "idle")` — update phase.
//   3. `setCurrentTool(name, args?)` — show what tool is running right now.
//   4. `setStepCount(n)` — refresh step counter.
//   5. `stop()` — unmount.
//
// Renders in place via the same `\x1b7 / \r\x1b[2K / \x1b8` pattern used by
// PersistentStatusBar — reserves no row, just overwrites the current cursor row.
//

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export type StepPhase = "thinking" | "tool" | "streaming" | "idle"

// Default step budget — matches stepCountIs(8) in concentrate-service.
const DEFAULT_MAX_STEPS = 8
// Safety timeout in concentrate-service is 120s. Warning thresholds:
//   60s — model may be overloaded
//   90s — approaching timeout
//  110s — critical (10s remaining)
const TIMEOUT_HEADS_UP_MS = 60_000
const TIMEOUT_WARNING_MS = 90_000
const TIMEOUT_CRITICAL_MS = 110_000
const SAFETY_TIMEOUT_MS = 120_000

export class StepStatusRow {
  private running = false
  private cols = 80
  private tickInterval: ReturnType<typeof setInterval> | null = null
  private frameInterval: ReturnType<typeof setInterval> | null = null
  private frameIndex = 0
  private agentName = ""
  private modelName = ""
  private phase: StepPhase = "idle"
  private currentToolName = ""
  private currentToolArgs: unknown = undefined
  private stepCount = 0
  private maxSteps = DEFAULT_MAX_STEPS
  private startMs = 0
  private totalStartMs = 0
  // Per-tool timing: reset each time setCurrentTool is called
  private toolStartMs = 0
  // Simple ETA: rolling average of tool durations per tool type (ms)
  private toolDurationHistory = new Map<string, number[]>()

  start(agentName: string, modelName: string) {
    if (this.running) return
    this.running = true
    this.agentName = agentName
    this.modelName = modelName
    this.phase = "thinking"
    this.currentToolName = ""
    this.currentToolArgs = undefined
    this.stepCount = 0
    this.maxSteps = DEFAULT_MAX_STEPS
    this.startMs = Date.now()
    this.totalStartMs = Date.now()
    this.toolStartMs = 0
    this.cols = process.stdout.columns ?? 80

    this.frameIndex = 0
    this.render()

    this.tickInterval = setInterval(() => {
      if (!this.running) return
      this.render()
    }, 1000)

    this.frameInterval = setInterval(() => {
      if (!this.running) return
      this.frameIndex = (this.frameIndex + 1) % FRAMES.length
      this.render()
    }, 100)
  }

  setMaxSteps(n: number) {
    this.maxSteps = n
    this.render()
  }

  setPhase(phase: StepPhase) {
    this.phase = phase
    if (this.running && phase === "thinking") {
      this.startMs = Date.now()
      this.currentToolName = ""
      this.currentToolArgs = undefined
    }
    this.render()
  }

  setCurrentTool(name: string, args?: unknown) {
    // Record elapsed for the previous tool before switching
    if (this.currentToolName && this.toolStartMs > 0) {
      const elapsed = Date.now() - this.toolStartMs
      const history = this.toolDurationHistory.get(this.currentToolName) ?? []
      history.push(elapsed)
      // Keep only last 5 entries
      if (history.length > 5) history.shift()
      this.toolDurationHistory.set(this.currentToolName, history)
    }
    this.currentToolName = name
    this.currentToolArgs = args
    this.phase = "tool"
    this.toolStartMs = Date.now()
    this.render()
  }

  setStepCount(n: number) {
    this.stepCount = n
    this.render()
  }

  setStreaming() {
    this.phase = "streaming"
    this.render()
  }

  resize(newWidth: number) {
    this.cols = newWidth
    this.render()
  }

  stop() {
    this.running = false
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }
    if (this.frameInterval) {
      clearInterval(this.frameInterval)
      this.frameInterval = null
    }
  }

  private render() {
    if (!this.running) return
    if (!process.stdout.isTTY) return
    const frame = FRAMES[this.frameIndex] ?? "⠋"

    const elapsed = this.elapsed()
    const totalElapsedMs = Date.now() - this.totalStartMs
    const phaseLabel = this.phaseLabel()
    const dots = " " + chalk.hex(theme.greenDim)("·") + " "

    const parts: string[] = []
    parts.push(chalk.hex(theme.amber)(frame))
    parts.push(chalk.hex(theme.greenGlow)(phaseLabel))
    parts.push(chalk.hex(theme.greenDim)(elapsed))

    if (this.currentToolName) {
      const arg = extractToolArg(this.currentToolName, this.currentToolArgs)
      const label = chalk.hex(theme.greenGlow)(this.currentToolName)
      const argStr = arg ? chalk.hex(theme.greenMute)(arg) : ""
      parts.push(chalk.hex(theme.greenDim)("→"))
      parts.push(argStr ? `${label} ${argStr}` : label)
      // Per-tool elapsed time
      if (this.toolStartMs > 0) {
        const toolElapsed = Date.now() - this.toolStartMs
        const toolElapsedStr = toolElapsed < 1000 ? `${toolElapsed}ms` : `${(toolElapsed / 1000).toFixed(1)}s`
        parts.push(chalk.hex(theme.muted)(toolElapsedStr))
      }
      // Simple ETA: average of past durations × estimated remaining steps
      const estimatedRemaining = this.estimateRemaining()
      if (estimatedRemaining > 0) {
        parts.push(chalk.hex(theme.greenDim)(`~${estimatedRemaining}`))
      }
    } else if (this.agentName) {
      // "Model processing" heartbeat label when waiting for model response
      const modelLabel = this.stepCount > 0
        ? `Model processing tool result`
        : `▣ ${this.agentName}${this.modelName ? " · " + this.modelName : ""}`
      parts.push(chalk.hex(theme.greenMute)(modelLabel))
    } else if (this.modelName) {
      parts.push(chalk.hex(theme.greenGlow)(this.modelName))
    }

    if (this.stepCount > 0) {
      parts.push(chalk.hex(theme.greenDim)("step"))
      parts.push(chalk.hex(theme.greenGlow)(
        this.maxSteps > 0 ? `${this.stepCount}/${this.maxSteps}` : String(this.stepCount),
      ))
    }

    // Timeout proximity warning: escalating levels of urgency.
    if (totalElapsedMs >= TIMEOUT_CRITICAL_MS) {
      const remaining = Math.max(0, SAFETY_TIMEOUT_MS - totalElapsedMs)
      parts.push(chalk.hex(theme.red)(`⏱ ${(remaining / 1000).toFixed(0)}s left`))
    } else if (totalElapsedMs >= TIMEOUT_WARNING_MS) {
      const remaining = Math.max(0, SAFETY_TIMEOUT_MS - totalElapsedMs)
      parts.push(chalk.hex(theme.amber)(`⚠ approaching timeout · ${(remaining / 1000).toFixed(0)}s`))
    } else if (totalElapsedMs >= TIMEOUT_HEADS_UP_MS) {
      const elapsedSec = totalElapsedMs / 1000
      parts.push(chalk.hex(theme.amber)(`(!) ${elapsedSec.toFixed(0)}s elapsed — model may be overloaded`))
    }

    const inner = parts.join(dots)
    const innerLen = stripAnsiLen(inner)
    const fill = Math.max(1, this.cols - innerLen - 4)
    const leftBorder = chalk.hex(theme.greenDim)("┃")
    const fillLine = chalk.hex(theme.greenDim)("─".repeat(fill))

    process.stdout.write("\x1b7")
    process.stdout.write("\r\x1b[2K")
    process.stdout.write(`${leftBorder} ${inner} ${fillLine}`)
    process.stdout.write("\x1b8")
  }

  // Estimate remaining time based on average per-tool history × remaining steps
  private estimateRemaining(): string {
    if (this.toolDurationHistory.size === 0) return ""
    let totalAvg = 0
    let count = 0
    for (const durations of this.toolDurationHistory.values()) {
      if (durations.length > 0) {
        totalAvg += durations.reduce((a, b) => a + b, 0) / durations.length
        count++
      }
    }
    if (count === 0) return ""
    const avgToolMs = totalAvg / count
    const remainingSteps = Math.max(0, this.maxSteps - this.stepCount)
    const estimatedMs = avgToolMs * remainingSteps
    if (estimatedMs < 1000) return ""
    if (estimatedMs < 60_000) return `~${(estimatedMs / 1000).toFixed(0)}s`
    return `~${Math.round(estimatedMs / 60_000)}m ${Math.round((estimatedMs % 60_000) / 1000)}s`
  }

  private phaseLabel(): string {
    switch (this.phase) {
      case "thinking":
        return "Thinking"
      case "tool":
        return "Tool"
      case "streaming":
        return "Streaming"
      case "idle":
      default:
        return "Idle"
    }
  }

  private elapsed(): string {
    const ms = Date.now() - this.startMs
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    const m = Math.floor(ms / 60000)
    const s = Math.round((ms % 60000) / 1000)
    return `${m}m ${s}s`
  }
}

// Strip ANSI codes to compute visual length.
// Local copy — keeps this module dependency-free.
function stripAnsiLen(s: string): number {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").length
}

// Best single-argument projection per tool name. Mirrors extractToolArg in
// thinking.ts so the status row's tool label matches the rest of the TUI.
function extractToolArg(toolName: string, args?: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined
  const a = args as Record<string, unknown>
  const fileKey =
    a.file_path ?? a.path ?? a.filePath ?? a.file ?? a.filepath ?? a.target ?? a.notebook_path
  if (typeof fileKey === "string") return fileKey
  const url = a.url ?? a.uri ?? a.href
  if (typeof url === "string") return url
  if (a.command) return String(a.command)
  if (a.query) return String(a.query)
  if (a.prompt) return String(a.prompt).slice(0, 60)
  return undefined
}

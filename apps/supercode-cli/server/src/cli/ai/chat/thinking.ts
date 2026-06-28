import chalk from "chalk"
import { theme, stripAnsi } from "src/cli/utils/tui"

const SPINNER_FRAMES = ["∴", "∵", "∴", "∵"]
const BG_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

export function reasoningSummary(text: string) {
  const content = text.trim()
  const match = content.match(/^\*\*([^*\n]+)\*\*(?:\r?\n\r?\n|$)/)
  if (!match || !match[1]) return { title: null, body: content }
  return { title: match[1].trim(), body: content.slice(match[0]!.length).trimEnd() }
}

//
// Extract the most useful argument from a tool call for inline display.
// For Read/Write/Edit we want the file path. For others we stringify.
//
export function extractToolArg(toolName: string, args: unknown): string | undefined {
  if (!args || typeof args !== "object") return undefined
  const a = args as Record<string, unknown>
  const fileKey =
    a.file_path ?? a.path ?? a.filePath ?? a.file ?? a.filepath ?? a.target ?? a.notebook_path
  if (typeof fileKey === "string") return fileKey
  const url = a.url ?? a.uri ?? a.href
  if (typeof url === "string") return url
  if (a.command) return String(a.command)
  if (a.prompt) return String(a.prompt).slice(0, 60)
  return undefined
}

export function toolLabel(toolName: string, args?: unknown): string {
  const arg = extractToolArg(toolName, args)
  const name = chalk.hex(theme.greenGlow)(toolName)
  if (arg) {
    return ` ${chalk.hex(theme.greenDim)("→")} ${name} ${chalk.hex(theme.greenMute)(arg)}`
  }
  // Empty/missing args are a bug indicator (model failed to fill the schema).
  // Surface this loudly so the user can see the model is misbehaving.
  if (args && typeof args === "object" && Object.keys(args).length > 0) {
    const json = JSON.stringify(args).slice(0, 80)
    return ` ${chalk.hex(theme.greenDim)("→")} ${name} ${chalk.hex(theme.greenMute)(json)}`
  }
  return ` ${chalk.hex(theme.red)("→")} ${name} ${chalk.hex(theme.red)("(missing arguments — model bug)")}`
}

//
// ─── COLLAPSIBLE REASONING BLOCK ──────────────────────────────────────────────
//
// Renders the model's internal reasoning as a collapsed terminal block:
//
//   ┃ ▼ Thought: 5.6s
//
// The block is collapsed by default — the full reasoning text was already shown
// in real time via the ThinkingDisplay spinner, so this serves as a persistent
// bookmark indicating the model engaged in reasoning and how long it took.
//
export function renderReasoningBlock(reasoning: string, elapsedMs: number): string {
  const elapsed = elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`
  const indent = chalk.hex(theme.greenDim)("┃")
  const toggle = chalk.hex(theme.greenGlow)("▼")
  const label = chalk.hex(theme.greenMute)("Thought")
  const time = chalk.hex(theme.greenDim)(`· ${elapsed}`)
  return `${indent} ${toggle} ${label} ${time}`
}

// Row where the spinner lives during streaming. Matches the row the user
// just typed on. We don't write anywhere else — renderInput owns the row.
export class ThinkingDisplay {
  private i = 0
  private intervalId: ReturnType<typeof setInterval> | null = null
  private currentLabel = ""
  private running = false
  private speedMs = 120
  private speedTimer: ReturnType<typeof setTimeout> | null = null
  private chain = new ThoughtChain()
  private currentPhase: "reasoning" | "tool" = "reasoning"
  private currentToolName = ""
  private currentToolArgs: unknown = undefined
  private thoughtStartTime = Date.now()
  private elapsedTimer: ReturnType<typeof setInterval> | null = null
  // Accumulated per-turn tool count for the status bar
  private toolCount = 0
  // Once true, the spinner stays off — we already emitted the assistant header.
  private headerEmitted = false

  markHeaderEmitted() {
    this.headerEmitted = true
  }

  // Pause spinner output without losing state. Used while the user is typing
  // in the prompt so the spinner doesn't overwrite their input.
  pause() {
    if (!this.running) return
    this.running = false
    if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
    if (this.elapsedTimer) { clearInterval(this.elapsedTimer); this.elapsedTimer = null }
    if (this.speedTimer) { clearTimeout(this.speedTimer); this.speedTimer = null }
    if (process.stdout.isTTY) {
      process.stdout.write("\x1b7")
      process.stdout.write("\r\x1b[2K")
      process.stdout.write("\x1b8")
    }
  }

  resume() {
    if (this.running || this.headerEmitted) return
    this.running = true
    this.i = 0
    this.thoughtStartTime = Date.now()
    this.tick()
    this.elapsedTimer = setInterval(() => {
      if (!this.running) return
      this.refreshLabel()
    }, 1000)
  }

  reset() {
    this.chain = new ThoughtChain()
    this.currentPhase = "reasoning"
    this.currentToolName = ""
    this.currentToolArgs = undefined
    this.toolCount = 0
    this.headerEmitted = false
  }

  start(label: string) {
    this.currentLabel = label
    if (this.running) return
    this.running = true
    this.i = 0
    this.thoughtStartTime = Date.now()
    this.toolCount = 0
    this.beginThought()
    this.tick()

    this.elapsedTimer = setInterval(() => {
      if (!this.running) return
      this.refreshLabel()
    }, 1000)
  }

  private beginThought() {
    this.chain.finish()
    this.chain.begin()
  }

  private refreshLabel() {
    if (!this.running) return
    const elapsed = Date.now() - this.thoughtStartTime
    const time = elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`
    if (this.currentPhase === "tool") {
      this.currentLabel = `${this.currentToolName} · ${time}`
    } else {
      this.currentLabel = `Thinking · ${time}`
    }
    this.renderSpinner()
  }

  private tick = () => {
    if (!this.running) return
    this.renderSpinner()
    this.i = (this.i + 1) % SPINNER_FRAMES.length
    this.speedTimer = setTimeout(this.tick, this.speedMs)
  }

  private renderSpinner() {
    if (!this.running) return
    if (!process.stdout.isTTY) return
    const frame = SPINNER_FRAMES[this.i] ?? "∴"
    // Save cursor, write on current row with carriage return + clear-line,
    // restore cursor. Keeps the spinner on the same physical row regardless
    // of where the cursor was last parked.
    process.stdout.write("\x1b7")
    process.stdout.write(`\r\x1b[2K`)
    process.stdout.write(
      `${chalk.hex(theme.amber)(frame)} ${chalk.hex(theme.greenMute)(this.currentLabel)}`,
    )
    process.stdout.write("\x1b8")
  }

  setLabel(label: string) {
    this.currentLabel = label
    if (this.running) this.renderSpinner()
  }

  stop() {
    this.running = false
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer)
      this.elapsedTimer = null
    }
    if (this.speedTimer) {
      clearTimeout(this.speedTimer)
      this.speedTimer = null
    }
    // Close the current thought so the chain is consistent
    this.chain.finish()
    // Clear the spinner row
    if (process.stdout.isTTY) {
      process.stdout.write("\x1b7")
      process.stdout.write(`\r\x1b[2K`)
      process.stdout.write("\x1b8")
    }
  }

  succeed(text?: string) {
    this.stop()
    if (text) console.log(` ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.greenMute)(text)}`)
  }

  fail(text?: string) {
    this.stop()
    if (text) console.log(` ${chalk.hex(theme.red)("◆")} ${chalk.hex(theme.red)(text)}`)
  }

  showToolCall(toolName: string, args?: unknown) {
    if (this.running) {
      this.running = false
      if (this.intervalId) { clearInterval(this.intervalId); this.intervalId = null }
      if (this.elapsedTimer) { clearInterval(this.elapsedTimer); this.elapsedTimer = null }
      if (this.speedTimer) { clearTimeout(this.speedTimer); this.speedTimer = null }
      if (process.stdout.isTTY) {
        process.stdout.write("\x1b7")
        process.stdout.write("\r\x1b[2K")
        process.stdout.write("\x1b8")
      }
    }
    this.chain.addTool(toolName, args ? JSON.stringify(args) : undefined)
    this.toolCount++
    console.log(toolLabel(toolName, args))
  }

  showReasoning(content: string) {
    const summary = reasoningSummary(content)
    const title = summary.title || "thinking"
    // Only restart the spinner if we haven't already emitted the header.
    // After emitHeader() (i.e. after first tool call or first text chunk),
    // the spinner stays off — otherwise it would re-anchor on a new row
    // every reasoning delta and scroll the terminal.
    if (this.headerEmitted) {
      return
    }
    if (!this.running) {
      this.start(`think: ${title}`)
    } else {
      this.setLabel(`think: ${title}`)
    }
  }

  getChain(): ThoughtChain {
    return this.chain
  }

  getToolCount(): number {
    return this.toolCount
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
export function formatToolGroup(toolName: string, count: number, args?: string): string {
  const arg = extractToolArg(toolName, args ? safeParse(args) : undefined)
  const label = chalk.hex(theme.greenGlow)(toolName)
  const arrow = chalk.hex(theme.greenDim)("→")
  if (count <= 1) {
    if (arg) return ` ${arrow} ${label} ${chalk.hex(theme.greenMute)(arg)}`
    return ` ${arrow} ${label}`
  }
  if (arg) {
    return ` ${arrow} ${label} ${chalk.hex(theme.greenMute)(arg)} ${chalk.hex(theme.greenMute)(`×${count}`)}`
  }
  return ` ${arrow} ${label} ${chalk.hex(theme.greenMute)(`×${count}`)}`
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s)
  } catch {
    return undefined
  }
}

export function showToolSequence(toolCalls: Array<{ name: string; args?: string }>) {
  if (toolCalls.length === 0) return
  const groups: Array<{ name: string; args?: string; count: number }> = []
  for (const tc of toolCalls) {
    const last = groups[groups.length - 1]
    if (last && last.name === tc.name && last.args === tc.args) {
      last.count++
    } else {
      groups.push({ name: tc.name, args: tc.args, count: 1 })
    }
  }
  for (const g of groups) {
    console.log(formatToolGroup(g.name, g.count, g.args))
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
      : chalk.hex(theme.greenGlow)("▼")
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
      for (const [toolName, argsList] of grouped) {
        const lastArg = argsList[argsList.length - 1]
        if (argsList.length <= 1) {
          lines.push(`${indent}   ${toolLabel(toolName, lastArg ? JSON.parse(lastArg) : undefined)}`)
        } else {
          lines.push(`${indent}   ${formatToolGroup(toolName, argsList.length, lastArg)}`)
        }
      }
    }

    return lines.join("\n")
  }

  private groupTools(tools: ThoughtTool[]): Array<[string, string[]]> {
    const groups: Array<[string, string[]]> = []
    for (const t of tools) {
      const last = groups[groups.length - 1]
      if (last && last[0] === t.name && last[1][last[1].length - 1] === t.args) {
        last[1].push(t.args ?? "")
      } else {
        groups.push([t.name, [t.args ?? ""]])
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

//
// ─── TURN TRACKER ─────────────────────────────────────────────────────────────
//
// Per-turn record of tool calls and their outcomes. Used by the chat loop to:
//   1. Surface empty/error tool results in the post-turn Thought chain (red).
//   2. Detect the "all tools returned empty" case and inject a system message
//      telling the model to stop inventing content.
//   3. Dedupe repeated denied tools so the model doesn't loop on permissions.
//
// A tool result is considered "empty" when the parsed JSON has
// `success === false`, or when it's not parseable but contains no useful text.
// "Useful text" means > 20 chars after trimming.
//
export interface TurnToolCall {
  name: string
  args: unknown
  rawResult: string
  parsed: any | null
  success: boolean
  empty: boolean
  error?: string
  permissionDenied: boolean
}

export class TurnTracker {
  private calls: TurnToolCall[] = []
  // Count of consecutive denials for the same tool (resets on success or new tool).
  private deniedCounts = new Map<string, number>()
  // Track which tool was last called so consecutive-same-tool calls dedupe.
  private lastToolName: string | null = null

  recordCall(name: string, args: unknown, rawResult: string): TurnToolCall {
    const entry = this.parseResult(name, args, rawResult)

    if (entry.permissionDenied) {
      const prev = this.deniedCounts.get(name) ?? 0
      this.deniedCounts.set(name, prev + 1)
    } else {
      this.deniedCounts.set(name, 0)
    }

    this.calls.push(entry)
    this.lastToolName = name
    return entry
  }

  private parseResult(name: string, args: unknown, rawResult: string): TurnToolCall {
    let parsed: any = null
    try {
      parsed = JSON.parse(rawResult)
    } catch {
      parsed = null
    }

    // Permission-manager canonical denial shape
    if (parsed && typeof parsed === "object" && parsed.cancelled === true) {
      return {
        name,
        args,
        rawResult,
        parsed,
        success: false,
        empty: true,
        error: String(parsed.reason ?? "Permission denied"),
        permissionDenied: true,
      }
    }

    // Tool-returned structured envelope with success: false
    if (parsed && typeof parsed === "object" && parsed.success === false) {
      return {
        name,
        args,
        rawResult,
        parsed,
        success: false,
        empty: true,
        error: String(parsed.error ?? "Tool returned error"),
        permissionDenied: false,
      }
    }

    // Tool-returned structured envelope with success: true
    if (parsed && typeof parsed === "object" && parsed.success === true) {
      // Heuristic: count this as "empty" if the structured payload has no content
      const text = extractMeaningfulText(parsed)
      return {
        name,
        args,
        rawResult,
        parsed,
        success: true,
        empty: text === null || text.length === 0,
        permissionDenied: false,
      }
    }

    // Plain-string result
    const trimmed = (rawResult ?? "").trim()
    return {
      name,
      args,
      rawResult,
      parsed,
      success: true,
      empty: trimmed.length < 20,
      permissionDenied: false,
    }
  }

  allCalls(): TurnToolCall[] {
    return this.calls
  }

  // True when at least one tool was called AND every call's result was empty/error.
  hasAnyToolCalls(): boolean {
    return this.calls.length > 0
  }

  allResultsEmpty(): boolean {
    if (this.calls.length === 0) return false
    return this.calls.every((c) => c.empty)
  }

  emptyCount(): number {
    return this.calls.filter((c) => c.empty).length
  }

  totalCount(): number {
    return this.calls.length
  }

  deniedCount(name: string): number {
    return this.deniedCounts.get(name) ?? 0
  }

  // Returns a system-message nudge for the model. Tells it to stop trying to
  // fabricate an answer when every tool it called returned empty.
  buildEmptyResultSentinel(): string | null {
    if (!this.hasAnyToolCalls() || !this.allResultsEmpty()) return null
    const summary = this.calls
      .map((c) => {
        const reason = c.error ?? (c.empty ? "empty result" : "ok")
        return `- ${c.name}: ${reason}`
      })
      .join("\n")
    return [
      "SYSTEM NOTICE: All tool calls in this turn returned empty or error results.",
      "",
      "Tool outcomes this turn:",
      summary,
      "",
      "You have NO source material to answer the user's question from. Do NOT invent specifications, pricing, dates, leaderboard rankings, or any other factual claims. " +
        "Tell the user clearly what went wrong (which tool failed and why, based on the errors above) and suggest what they could try next.",
    ].join("\n")
  }

  // True if the last N calls to this tool were all denied. Used to short-circuit
  // permission loops.
  shouldStopDenialLoop(name: string, threshold = 2): boolean {
    return (this.deniedCounts.get(name) ?? 0) >= threshold
  }

  reset() {
    this.calls = []
    this.deniedCounts.clear()
    this.lastToolName = null
  }
}

// Walk a parsed tool result looking for the meaningful text payload so we can
// decide if it counts as "empty content". Tolerates shapes from every tool.
// Returns null if no real content field exists.
function extractMeaningfulText(parsed: any): string | null {
  if (typeof parsed === "string") return parsed.trim() || null
  if (!parsed || typeof parsed !== "object") return null
  const candidates = [
    parsed.content,
    parsed.summary,
    parsed.text,
    parsed.output,
    parsed.result,
    parsed.body,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim()
  }
  if (Array.isArray(parsed.results)) {
    const joined = parsed.results
      .map((r: any) => `${r.title ?? ""} ${r.snippet ?? ""}`)
      .join(" ")
      .trim()
    if (joined.length > 0) return joined
  }
  return null
}

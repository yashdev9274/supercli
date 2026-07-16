import chalk from "chalk"
import { theme } from "src/cli/utils/tui"

const SPINNER_FRAMES = ["∴", "∵", "∴", "∵"]

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
  if (a.task) return String(a.task).slice(0, 60)
  if (a.description) return String(a.description).slice(0, 60)
  return undefined
}

export function toolLabel(toolName: string, args?: unknown): string {
  const arg = extractToolArg(toolName, args)
  const { verb, color } = describeTool(toolName, arg)
  if (arg) {
    return `${chalk.hex(color)(verb)}`
  }
  if (args && typeof args === "object" && Object.keys(args).length > 0) {
    const json = JSON.stringify(args).slice(0, 80)
    return `${chalk.hex(color)(verb)} ${chalk.hex(theme.muted)(json)}`
  }
  return `${chalk.hex(theme.red)(`(${toolName} missing arguments — model bug)`)}`
}

// ─── Tool-type sections ────────────────────────────────────────────────────
//
// Tools are classified into thematic categories so the expanded thought block
// can group e.g. all read_file calls under "Files read [N]:".
//
export type ToolCategory = "read" | "edit" | "web" | "command" | "meta"

export const CATEGORY_ORDER: ToolCategory[] = ["read", "command", "edit", "web", "meta"]

export const CATEGORY_LABELS: Record<ToolCategory, string> = {
  read: "Files read",
  edit: "Changes",
  web: "Web searches",
  command: "Commands",
  meta: "Agent",
}

export const CATEGORY_COLORS: Record<ToolCategory, string> = {
  read: "#7a8a82",
  edit: "#f0b87c",
  web: "#5ec27e",
  command: "#a5d6ff",
  meta: theme.muted,
}

export function categorizeTool(name: string): ToolCategory {
  switch (name) {
    case "read_file":
    case "search_files":
    case "glob":
      return "read"
    case "edit_file":
    case "write_file":
      return "edit"
    case "web_search":
    case "url_fetch":
    case "firecrawl_search":
    case "firecrawl_scrape":
    case "firecrawl_map":
      return "web"
    case "run_command":
    case "code_exec":
      return "command"
    default:
      return "meta"
  }
}

export function groupToolsByCategory(tools: ThoughtTool[]): Map<ToolCategory, ThoughtTool[]> {
  const map = new Map<ToolCategory, ThoughtTool[]>()
  for (const t of tools) {
    const cat = categorizeTool(t.name)
    const arr = map.get(cat) ?? []
    arr.push(t)
    map.set(cat, arr)
  }
  return map
}

function describeTool(toolName: string, arg?: string): { verb: string; color: string } {
  switch (toolName) {
    case "read_file":
      return { verb: arg ? `Read ${arg}` : "Read file", color: "#7a8a82" }
    case "edit_file":
      return { verb: arg ? `Edit ${arg}` : "Edit file", color: "#f0b87c" }
    case "write_file":
      return { verb: arg ? `Write ${arg}` : "Write file", color: "#7ee2a8" }
    case "search_files":
      return { verb: arg ? `Search ${arg}` : "Search files", color: "#7a8a82" }
    case "url_fetch":
      return { verb: arg ? `Fetch ${arg}` : "Fetch URL", color: "#7a8a82" }
    case "web_search":
      return { verb: arg ? `Search web for ${arg}` : "Search web", color: "#5ec27e" }
    case "firecrawl_search":
      return { verb: arg ? `Search ${arg}` : "Search", color: "#5ec27e" }
    case "firecrawl_scrape":
      return { verb: arg ? `Scrape ${arg}` : "Scrape", color: "#5ec27e" }
    case "firecrawl_map":
      return { verb: arg ? `Map ${arg}` : "Map site", color: "#5ec27e" }
    case "run_command":
      return { verb: arg ? `$ ${arg}` : "Run command", color: "#a5d6ff" }
    case "code_exec":
      return { verb: arg ? `Exec ${arg}` : "Execute code", color: "#a5d6ff" }
    case "delegate":
      return { verb: arg ? `Delegate: ${arg}` : "Delegate", color: theme.muted }
    case "task":
      return { verb: arg ? `Task: ${arg}` : "Task", color: theme.muted }
    case "read_instructions":
      return { verb: "Read instructions", color: "#7a8a82" }
    case "switch_to_agent_mode":
      return { verb: arg ? `Switch to ${arg}` : "Switch mode", color: theme.muted }
    default:
      return { verb: arg ? `${toolName} ${arg}` : toolName, color: "#7a8a82" }
  }
}

function truncateStr(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + "…"
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
  private stepNumber = 0
  private maxSteps = 8

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

  setStepCount(step: number) {
    this.stepNumber = step
    if (this.running) this.refreshLabel()
  }

  setMaxSteps(n: number) {
    this.maxSteps = n
    if (this.running) this.refreshLabel()
  }

  private refreshLabel() {
    if (!this.running) return
    const elapsed = Date.now() - this.thoughtStartTime
    const time = elapsed < 1000 ? `${elapsed}ms` : `${(elapsed / 1000).toFixed(1)}s`
    const stepStr = this.stepNumber > 0
      ? `Step ${this.stepNumber}/${this.maxSteps} · `
      : ""
    if (this.currentPhase === "tool") {
      this.currentLabel = `${stepStr}${this.currentToolName} · ${time}`
    } else {
      this.currentLabel = `${stepStr}Waiting for model · ${time}`
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
    // Track the tool call in the chain so it can be rendered in the post-turn
    // collapsible "▼ Thought" block. We do NOT print it live — only the
    // spinner shows on the input row during streaming. The full chain
    // (tool name + args + reasoning) renders together once streaming ends.
    this.chain.addTool(toolName, args ? JSON.stringify(args) : undefined)
    this.toolCount++

    // Update the spinner label so the user sees which tool is running,
    // without leaking the full tool-call line into the output scroll.
    this.currentToolName = toolName
    this.currentToolArgs = args
    this.currentPhase = "tool"
    if (!this.headerEmitted) {
      this.setLabel(`${toolName}`)
    }
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
  // True when the tool's result was denied by the user or came back empty/error.
  // Drives the red ✗ marker in the live per-step block and forces the block
  // to stay expanded on finish so the user can see what failed.
  flagged?: boolean
  // Snapshot lines (e.g. diff, file content, command output) captured at tool
  // completion time, rendered when the thought block is expanded.
  snapshot?: string[]
}

export interface ThoughtEntry {
  body: string
  tools: ThoughtTool[]
  subThoughts: ThoughtEntry[]
  // Task name for delegate/task subagent entries (e.g. "Find BUILTIN_CONNECTORS")
  taskName?: string
  startTime: number
  endTime: number | null
  collapsed: boolean
  // Live-render state. Set when the block has been emitted to stdout so
  // hotkeys (Ctrl+T) can re-render it in place without double-printing.
  printed: boolean
  // True while the step is in progress and the block is being appended to
  // (we open with ▼ and add rows below as tools fire). When the step
  // finishes we auto-collapse to + so the scrollback stays compact.
  openInProgress: boolean
  // True if any tool in this step returned empty / error / was denied.
  // finishAndPrint forces keepExpanded=true when this is set so the user
  // can see exactly which tool failed and what it returned.
  hadFlaggedTool: boolean
}

export class ThoughtChain {
  thoughts: ThoughtEntry[] = []
  current: ThoughtEntry | null = null
  private buffered: boolean

  constructor(buffered = false) {
    this.buffered = buffered
  }

  get isOpen(): boolean {
    return this.current?.openInProgress ?? false
  }

  begin(): ThoughtEntry {
    if (this.current) this.finish()
    const entry: ThoughtEntry = {
      body: "",
      tools: [],
      subThoughts: [],
      startTime: Date.now(),
      endTime: null,
      collapsed: false,
      printed: false,
      openInProgress: false,
      hadFlaggedTool: false,
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

  addTool(name: string, args?: string, flagged = false) {
    if (!this.current && this.thoughts.length > 0) {
      this.current = this.thoughts[this.thoughts.length - 1]!
    }
    if (!this.current) {
      const entry = this.begin()
      entry.tools.push({ name, args, flagged })
      return
    }
    const lastTool = this.current.tools[this.current.tools.length - 1]
    if (lastTool && lastTool.name === name && !lastTool.args && !flagged) {
      // Deduplicate consecutive same-named bare tool calls
      return
    }
    this.current.tools.push({ name, args, flagged })
    if (flagged) this.current.hadFlaggedTool = true
  }

  finish() {
    if (this.current) {
      this.current.endTime = Date.now()
      this.current = null
    }
  }

  // Mark the most recently appended tool row as flagged (denied/empty/error).
  // Drives the red ✗ in the expanded block AND forces keepExpanded on finish
  // so the user can see exactly which tool failed. No-op when there's no
  // open step or the last tool was already flagged (avoids double-counting
  // when a single call fans out to multiple result events).
  markLastToolFlagged(): void {
    if (!this.current) return
    const last = this.current.tools[this.current.tools.length - 1]
    if (!last) return
    if (!last.flagged) {
      last.flagged = true
      this.current.hadFlaggedTool = true
    }
  }

  // Per-step live render. Each call writes one ANSI line to stdout.
  // `beginAndPrint` opens an expanded ▼ Thought: 0.0s block.
  // `printToolRow` appends one ┃   → Read foo.ts line.
  // `finishAndPrint` closes the block: flips to + and adds a summary line.
  // All three are no-ops when stdout isn't a TTY (the chat loop already
  // captures the alternative plain-text path via printUnified).
  beginAndPrint(): ThoughtEntry | null {
    if (!this.buffered && !process.stdout.isTTY) return null
    const entry = this.begin()
    entry.openInProgress = true
    if (!this.buffered) {
      const elapsedStr = "0.0s"
      const indent = chalk.hex(theme.greenDim)("┃")
      const toggle = chalk.hex(theme.greenGlow)("▼")
      const label = chalk.hex(theme.greenMute)("Thought")
      const time = chalk.hex(theme.greenDim)(elapsedStr)
      process.stdout.write(
        `${indent} ${toggle} ${label} ${chalk.hex(theme.greenDim)("·")} ${time}\n`,
      )
    }
    entry.printed = true
    return entry
  }

  printToolRow(name: string, args?: unknown, flagged = false): void {
    if (!this.buffered && !process.stdout.isTTY) return
    if (!this.current || !this.current.openInProgress) return
    if (!this.buffered) {
      const indent = chalk.hex(theme.greenDim)("┃")
      const argsSerialized =
        typeof args === "string" ? safeParse(args) : args
      const row = toolLabel(name, argsSerialized)
      // Red ✗ marker after the tool label when the call was denied or returned
      // empty/error. Small visual hint that this row is the failure case.
      const marker = flagged
        ? ` ${chalk.hex(theme.red)("✗")}`
        : ""
      process.stdout.write(`${indent}   ${row}${marker}\n`)
    }
    // Keep entry.tools in sync so Ctrl+T toggle re-render matches what we
    // just printed.
    const serializedArgs =
      typeof args === "string" ? args : JSON.stringify(args ?? null)
    this.current.tools.push({ name, args: serializedArgs, flagged })
    // Mark the entry printed so togglePrinted knows how many lines to redraw
    this.current.printed = true
    if (flagged) this.current.hadFlaggedTool = true
  }

  finishAndPrint(opts?: { autoCollapse?: boolean; keepExpanded?: boolean }): void {
    if (!this.buffered && !process.stdout.isTTY) return
    if (!this.current) return
    const entry = this.current
    entry.endTime = Date.now()
    entry.openInProgress = false
    // keepExpanded (e.g. when a tool was denied/empty) wins over autoCollapse.
    entry.collapsed =
      entry.hadFlaggedTool ? false : (opts?.autoCollapse ?? true)
    const elapsedMs = entry.endTime - entry.startTime
    const elapsedStr =
      elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`

    if (!this.buffered) {
      const indent = chalk.hex(theme.greenDim)("┃")
      // Toggle: when auto-collapsing, move ▼ to +. When keeping open, keep ▼.
      const toggle = entry.collapsed
        ? chalk.hex(theme.greenGlow)("+")
        : chalk.hex(theme.greenGlow)("▼")
      const label = chalk.hex(theme.greenMute)("Thought")
      const time = chalk.hex(theme.greenDim)(elapsedStr)
      process.stdout.write(
        `${indent} ${toggle} ${label} ${chalk.hex(theme.greenDim)("·")} ${time}\n`,
      )

      // When auto-collapsed we show a summary line; when expanded we reprint
      // each tool so the user can see exactly what was called (with ✗ markers
      // for denied/empty rows), followed by snapshots and sub-thoughts.
      if (entry.collapsed) {
        this.writeCollapsedSummary(entry, indent)
      } else {
        this.writeExpandedDetail(entry, indent)
      }
    }
    entry.printed = true
    this.current = null
  }

  private writeCollapsedSummary(entry: ThoughtEntry, indent: string): void {
    const subCount = entry.subThoughts.length
    if (entry.tools.length > 0) {
      // Per-category summary counts
      const groups = groupToolsByCategory(entry.tools)
      const parts: string[] = []
      let hasFailures = false
      for (const cat of CATEGORY_ORDER) {
        const tools = groups.get(cat)
        if (!tools || tools.length === 0) continue
        const label = CATEGORY_LABELS[cat].toLowerCase()
        const flaggedCount = tools.filter((t) => t.flagged).length
        if (flaggedCount > 0) {
          const okCount = tools.length - flaggedCount
          if (okCount > 0) {
            parts.push(`${okCount} ${label}`)
          }
          parts.push(`${chalk.hex(theme.red)(`${flaggedCount} failed`)}`)
          hasFailures = true
        } else {
          parts.push(`${tools.length} ${label}`)
        }
      }
      const summary = hasFailures
        ? parts.join(" · ")
        : parts.join(" · ")
      const hint = subCount > 0
        ? ` ${chalk.hex(theme.greenDim)("[Ctrl+X]")}`
        : ` ${chalk.hex(theme.greenDim)("[Ctrl+T]")}`
      process.stdout.write(
        `${indent}   ${chalk.hex(theme.greenDim)("↳")} ${chalk.hex(theme.greenMute)(summary)}${hint}\n`,
      )
    }
    if (subCount > 0) {
      const subToolCount = entry.subThoughts.reduce((n, s) => n + s.tools.length, 0)
      process.stdout.write(
        `${indent}   ${chalk.hex(theme.greenDim)("↳")} ${chalk.hex(theme.greenMute)(`${subCount} explore step${subCount === 1 ? "" : "s"} · ${subToolCount} tool call${subToolCount === 1 ? "" : "s"}`)}\n`,
      )
    }
  }

  private writeExpandedDetail(entry: ThoughtEntry, indent: string): void {
    // Tool rows grouped by category
    const groups = groupToolsByCategory(entry.tools)
    let groupIdx = 0
    for (const cat of CATEGORY_ORDER) {
      const tools = groups.get(cat)
      if (!tools || tools.length === 0) continue
      if (groupIdx > 0) process.stdout.write("\n")
      groupIdx++
      // Section header only when 2+ tools in the group
      if (tools.length > 1) {
        const label = CATEGORY_LABELS[cat]
        const color = CATEGORY_COLORS[cat]
        process.stdout.write(
          `${indent}   ${chalk.hex(color)(`${label} [${tools.length}]:`)}\n`,
        )
      }
      for (const t of tools) {
        const argsParsed =
          typeof t.args === "string" ? safeParse(t.args) : t.args
        const { verb, color } = describeTool(
          t.name,
          extractToolArg(t.name, argsParsed),
        )
        const marker = t.flagged ? ` ${chalk.hex(theme.red)("✗")}` : ""
        process.stdout.write(`${indent}     ${chalk.hex(color)(verb)}${marker}\n`)
        if (t.snapshot) {
          for (const snapLine of t.snapshot) {
            process.stdout.write(snapLine + "\n")
          }
        }
      }
    }
    // Blank line before sub-thoughts if there are any tools shown
    if (entry.tools.length > 0 && entry.subThoughts.length > 0) process.stdout.write("\n")
    // Sub-thoughts nested under this entry
    this.writeSubThoughts(entry.subThoughts, indent)
  }

  private writeSubThoughts(subThoughts: ThoughtEntry[], indent: string): void {
    for (const sub of subThoughts) {
      const subElapsed = sub.endTime
        ? sub.endTime - sub.startTime
        : 0
      const subElapsedStr =
        subElapsed < 1000 ? `${subElapsed}ms` : `${(subElapsed / 1000).toFixed(1)}s`

      const hadFailures = sub.tools.some((t) => t.flagged)
      const subToggle = sub.collapsed
        ? (hadFailures ? chalk.hex(theme.greenGlow)("+") : chalk.hex("#5ec27e")("✓"))
        : chalk.hex(theme.greenGlow)("▼")
      const subLabel = chalk.hex(theme.greenMute)("Explore Task")
      const taskDesc = sub.taskName
        ? ` ${chalk.hex(theme.greenDim)("—")} ${chalk.hex(theme.white)(sub.taskName)}`
        : ""
      process.stdout.write(
        `${indent}   ${subToggle} ${subLabel}${taskDesc} ${chalk.hex(theme.greenDim)("·")} ${subElapsedStr}\n`,
      )

      if (sub.collapsed) {
        const toolCount = sub.tools.length
        const subThoughtCount = sub.subThoughts.reduce((n, s) => n + s.tools.length, 0)
        const totalTools = toolCount + subThoughtCount
        process.stdout.write(
          `${indent}     ${chalk.hex(theme.greenDim)("↳")} ${chalk.hex(theme.greenMute)(`${totalTools} toolcall${totalTools === 1 ? "" : "s"} · ${subElapsedStr}`)}\n`,
        )
      } else {
        const bodyLines = sub.body.trim().split("\n")
        for (const bl of bodyLines) {
          const trimmed = bl.trim()
          if (trimmed) {
            process.stdout.write(`${indent}     ${chalk.hex(theme.greenMute)(trimmed)}\n`)
          }
        }

        const groups = groupToolsByCategory(sub.tools)
        let groupIdx = 0
        for (const cat of CATEGORY_ORDER) {
          const tools = groups.get(cat)
          if (!tools || tools.length === 0) continue
          if (groupIdx > 0) process.stdout.write("\n")
          groupIdx++
          for (const t of tools) {
            const argsParsed =
              typeof t.args === "string" ? safeParse(t.args) : t.args
            const { verb, color } = describeTool(
              t.name,
              extractToolArg(t.name, argsParsed),
            )
            const marker = t.flagged ? ` ${chalk.hex(theme.red)("✗")}` : ""
            process.stdout.write(`${indent}     ${chalk.hex(color)(verb)}${marker}\n`)
            if (t.snapshot) {
              for (const snapLine of t.snapshot) {
                process.stdout.write(snapLine + "\n")
              }
            }
          }
        }
      }
    }
  }

  // Re-render a printed thought block in-place without changing its collapsed
  // state. Used by hotkeys that toggle sub-thoughts (Ctrl+X) and need to
  // refresh the parent without double-toggling it.
  reprintThought(index: number = this.thoughts.length - 1): void {
    if (!process.stdout.isTTY) return
    const entry = this.thoughts[index]
    if (!entry) return
    if (entry.endTime === null) return
    const out = this.renderThought(entry)
    process.stdout.write(out + "\n")
  }

  // Toggle the chevron of the most-recently printed thought by re-emitting
  // its block (collapsed ↔ expanded). Used by Ctrl+T.
  togglePrinted(index: number = this.thoughts.length - 1): void {
    if (!process.stdout.isTTY) return
    const entry = this.thoughts[index]
    if (!entry) return
    if (entry.endTime === null) return
    entry.collapsed = !entry.collapsed
    this.reprintThought(index)
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

    // Tool calls made during this thought — grouped by category
    const groups = groupToolsByCategory(entry.tools)
    let groupIdx = 0
    for (const cat of CATEGORY_ORDER) {
      const tools = groups.get(cat)
      if (!tools || tools.length === 0) continue
      if (groupIdx > 0) lines.push("")
      groupIdx++
      if (tools.length > 1) {
        const label = CATEGORY_LABELS[cat]
        const color = CATEGORY_COLORS[cat]
        lines.push(`${indent}   ${chalk.hex(color)(`${label} [${tools.length}]:`)}`)
      }
      for (const t of tools) {
        const argsParsed =
          typeof t.args === "string" ? safeParse(t.args) : t.args
        const { verb, color } = describeTool(
          t.name,
          extractToolArg(t.name, argsParsed),
        )
        const marker = t.flagged ? ` ${chalk.hex(theme.red)("✗")}` : ""
        lines.push(`${indent}     ${chalk.hex(color)(verb)}${marker}`)
        if (t.snapshot) {
          for (const snapLine of t.snapshot) {
            lines.push(snapLine)
          }
        }
      }
    }

    // Sub-thoughts nested under this entry
    if (entry.subThoughts.length > 0) {
      if (entry.tools.length > 0) lines.push("")
      for (const sub of entry.subThoughts) {
        const subElapsed = sub.endTime
          ? `${sub.endTime - sub.startTime}ms`
          : `${Date.now() - sub.startTime}ms`
        const hadFailures = sub.tools.some((t) => t.flagged)
        const subToggle = sub.collapsed
          ? (hadFailures ? chalk.hex(theme.greenDim)("▶") : chalk.hex("#5ec27e")("✓"))
          : chalk.hex(theme.greenGlow)("▼")
        const taskDesc = sub.taskName
          ? ` ${chalk.hex(theme.greenDim)("—")} ${chalk.hex(theme.white)(sub.taskName)}`
          : ""
        const subHeader = `${subToggle} ${chalk.hex(theme.greenMute)("Explore Task")}${taskDesc} ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.greenGlow)(subElapsed)}`
        lines.push(`${indent}   ${subHeader}`)

        if (!sub.collapsed) {
          const bodyLines = sub.body.trim().split("\n")
          for (const bl of bodyLines) {
            const trimmed = bl.trim()
            if (trimmed) {
              lines.push(`${indent}     ${chalk.hex(theme.greenMute)(trimmed)}`)
            }
          }

          const subGroups = groupToolsByCategory(sub.tools)
          for (const cat of CATEGORY_ORDER) {
            const tools = subGroups.get(cat)
            if (!tools || tools.length === 0) continue
            for (const t of tools) {
              const argsParsed =
                typeof t.args === "string" ? safeParse(t.args) : t.args
              const { verb, color } = describeTool(
                t.name,
                extractToolArg(t.name, argsParsed),
              )
              lines.push(`${indent}     ${chalk.hex(color)(verb)}`)
              if (t.snapshot) {
                for (const snapLine of t.snapshot) {
                  lines.push(snapLine)
                }
              }
            }
          }
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

  //
  // Render all thoughts as a SINGLE collapsible "▼ Thought: ..." block.
  // This is the opencode TUI style: one toggle containing the full chain,
  // collapsed by default. Reasoning + tool calls are listed inside; if the
  // chain is empty, returns "" so the caller can skip the print.
  //
  renderUnified(): string {
    if (this.thoughts.length === 0) return ""

    // Merge every thought's body + tools into one block. Total elapsed is
    // from first thought start to last thought end.
    const first = this.thoughts[0]!
    const last = this.thoughts[this.thoughts.length - 1]!
    const elapsedMs = (last.endTime ?? Date.now()) - first.startTime
    const elapsed =
      elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`

    const indent = chalk.hex(theme.greenDim)("┃")
    const toggle = chalk.hex(theme.greenGlow)("▼")
    const label = chalk.hex(theme.greenMute)("Thought")
    const time = chalk.hex(theme.greenDim)(elapsed)

    const lines: string[] = []
    lines.push(`${indent} ${toggle} ${label} ${chalk.hex(theme.greenDim)("·")} ${time}`)

    // Per-category tool counts — keeps the collapsed block informative.
    const allTools = this.thoughts.flatMap((t) => t.tools)
    if (allTools.length > 0) {
      const allGroups = groupToolsByCategory(allTools)
      const parts: string[] = []
      for (const cat of CATEGORY_ORDER) {
        const tools = allGroups.get(cat)
        if (!tools || tools.length === 0) continue
        const label = CATEGORY_LABELS[cat].toLowerCase()
        parts.push(`${tools.length} ${label}`)
      }
      if (parts.length > 0) {
        lines.push(
          `${indent}   ${chalk.hex(theme.greenDim)("↳")} ${chalk.hex(theme.greenMute)(parts.join(" · "))}`,
        )
      }
    }

    // Expand the block: list each thought's reasoning + tool calls grouped
    // by category.
    for (const thought of this.thoughts) {
      const body = thought.body.trim()
      if (body) {
        for (const bl of body.split("\n")) {
          const trimmed = bl.trim()
          if (trimmed) {
            lines.push(
              `${indent}   ${chalk.hex(theme.greenMute)(trimmed)}`,
            )
          }
        }
      }
      if (thought.tools.length > 0) {
        const groups = groupToolsByCategory(thought.tools)
        let groupIdx = 0
        for (const cat of CATEGORY_ORDER) {
          const tools = groups.get(cat)
          if (!tools || tools.length === 0) continue
          if (groupIdx > 0) lines.push("")
          groupIdx++
          if (tools.length > 1) {
            const label = CATEGORY_LABELS[cat]
            const color = CATEGORY_COLORS[cat]
            lines.push(`${indent}   ${chalk.hex(color)(`${label} [${tools.length}]:`)}`)
          }
          for (const t of tools) {
            const argsParsed =
              typeof t.args === "string" ? safeParse(t.args) : t.args
            const { verb, color } = describeTool(
              t.name,
              extractToolArg(t.name, argsParsed),
            )
            lines.push(`${indent}     ${chalk.hex(color)(verb)}`)
          }
        }
      }
    }

    return lines.join("\n")
  }

  printUnified() {
    const out = this.renderUnified()
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
function extractMeaningfulText(parsed: any, depth = 0): string | null {
  if (typeof parsed === "string") return parsed.trim() || null
  if (!parsed || typeof parsed !== "object") return null
  if (depth > 3) return null

  const candidates = [
    parsed.content,
    parsed.summary,
    parsed.text,
    parsed.output,
    parsed.result,
    parsed.body,
    parsed.data,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c.trim()
    if (c && typeof c === "object" && !Array.isArray(c)) {
      const nested = extractMeaningfulText(c, depth + 1)
      if (nested !== null) return nested
    }
  }

  const arrayCandidates = [
    parsed.results,
    parsed.data?.results,
    parsed.data?.links,
    parsed.data?.matches,
  ]
  for (const arr of arrayCandidates) {
    if (Array.isArray(arr) && arr.length > 0) {
      const joined = arr
        .map((r: any) =>
          typeof r === "string"
            ? r
            : `${r.title ?? r.file ?? ""} ${r.snippet ?? r.line ?? ""} ${r.url ?? r.link ?? ""}`,
        )
        .join(" ")
        .trim()
      if (joined.length > 0) return joined
    }
  }

  // Fallback: any string property ≥ 20 chars on the current or nested data
  for (const key of Object.keys(parsed)) {
    const val = parsed[key]
    if (typeof val === "string" && val.trim().length >= 20) return val.trim()
  }

  return null
}

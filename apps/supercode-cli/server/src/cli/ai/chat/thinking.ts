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
  return undefined
}

export function toolLabel(toolName: string, args?: unknown): string {
  const arg = extractToolArg(toolName, args)
  const { chip, verb, color } = chipFor(toolName)
  const chipStr = chalk.bgHex(color).hex("#0d1117").bold(` ${chip} `)
  if (arg) {
    return ` ${chipStr} ${chalk.hex(theme.greenMute)(truncateStr(arg, 80))}`
  }
  if (args && typeof args === "object" && Object.keys(args).length > 0) {
    const json = JSON.stringify(args).slice(0, 80)
    return ` ${chipStr} ${chalk.hex(theme.muted)(json)}`
  }
  const errChip = chalk.bgHex("#5a1a1a").hex("#ffffff").bold(` ${chip} `)
  return ` ${errChip} ${chalk.hex(theme.red)(`(${verb} missing arguments — model bug)`)}`
}

// Per-tool chip label + accent color. Mirrors the design language in
// apps/supercode-cli/plan/feat/cli/cmd.png.
function chipFor(toolName: string): { chip: string; verb: string; color: string } {
  switch (toolName) {
    case "write_file":
      return { chip: "WRITE", verb: "write", color: "#1f3a2c" }
    case "edit_file":
      return { chip: "EDIT", verb: "edit", color: "#3a2e1a" }
    case "read_file":
      return { chip: "READ", verb: "read", color: "#2a2440" }
    case "search_files":
      return { chip: "GREP", verb: "search", color: "#2a2440" }
    case "url_fetch":
      return { chip: "FETCH", verb: "fetch", color: "#2a2440" }
    case "web_search":
      return { chip: "SEARCH", verb: "search", color: "#2a2440" }
    case "run_command":
      return { chip: "BASH", verb: "run", color: "#1a2e3a" }
    case "code_exec":
      return { chip: "EXEC", verb: "exec", color: "#1a2e3a" }
    case "switch_to_agent_mode":
      return { chip: "MODE", verb: "switch", color: "#2a2440" }
    case "delegate":
      return { chip: "DELEGATE", verb: "delegate", color: "#2a2440" }
    case "task":
      return { chip: "TASK", verb: "task", color: "#2a2440" }
    case "read_instructions":
      return { chip: "INSTRUCT", verb: "read", color: "#2a2440" }
    default:
      return { chip: toolName.toUpperCase().slice(0, 8), verb: toolName, color: "#2a2440" }
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
}

export interface ThoughtEntry {
  body: string
  tools: ThoughtTool[]
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
  private current: ThoughtEntry | null = null

  begin(): ThoughtEntry {
    if (this.current) this.finish()
    const entry: ThoughtEntry = {
      body: "",
      tools: [],
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
    if (!process.stdout.isTTY) return null
    const entry = this.begin()
    entry.openInProgress = true
    const elapsedStr = "0.0s"
    const indent = chalk.hex(theme.greenDim)("┃")
    const toggle = chalk.hex(theme.greenGlow)("▼")
    const label = chalk.hex(theme.greenMute)("Thought")
    const time = chalk.hex(theme.greenDim)(elapsedStr)
    process.stdout.write(
      `${indent} ${toggle} ${label} ${chalk.hex(theme.greenDim)("·")} ${time}\n`,
    )
    entry.printed = true
    return entry
  }

  printToolRow(name: string, args?: unknown, flagged = false): void {
    if (!process.stdout.isTTY) return
    if (!this.current || !this.current.openInProgress) return
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
    if (!process.stdout.isTTY) return
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
    // for denied/empty rows).
    if (entry.collapsed) {
      if (entry.tools.length > 0) {
        const okCount = entry.tools.filter((t) => !t.flagged).length
        const flaggedCount = entry.tools.filter((t) => t.flagged).length
        const summary =
          flaggedCount > 0
            ? `${okCount} ok · ${chalk.hex(theme.red)(`${flaggedCount} failed`)}`
            : `${entry.tools.length} tool call${entry.tools.length === 1 ? "" : "s"}`
        process.stdout.write(
          `${indent}   ${chalk.hex(theme.greenDim)("↳")} ${chalk.hex(theme.greenMute)(summary)}\n`,
        )
      }
    } else {
      // Expanded — list each tool row, with ✗ for flagged ones.
      for (const t of entry.tools) {
        const argsParsed =
          typeof t.args === "string" ? safeParse(t.args) : t.args
        const row = toolLabel(t.name, argsParsed)
        const marker = t.flagged ? ` ${chalk.hex(theme.red)("✗")}` : ""
        process.stdout.write(`${indent}   ${row}${marker}\n`)
      }
    }
    entry.printed = true
    this.current = null
  }

  // Toggle the chevron of the most-recently printed thought by re-emitting
  // its block (collapsed ↔ expanded). Used by Ctrl+T.
  togglePrinted(index: number = this.thoughts.length - 1): void {
    if (!process.stdout.isTTY) return
    const entry = this.thoughts[index]
    if (!entry) return
    if (entry.endTime === null) return // can't toggle an open step
    entry.collapsed = !entry.collapsed
    const out = this.renderThought(entry)
    // renderThought doesn't write to stdout; emit it. The hotkey handler
    // is responsible for clearing the previous block first using line math.
    process.stdout.write(out + "\n")
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

    // Tool count summary line — keeps the collapsed block informative.
    const toolCount = this.thoughts.reduce((n, t) => n + t.tools.length, 0)
    if (toolCount > 0) {
      lines.push(
        `${indent}   ${chalk.hex(theme.greenDim)("↳")} ${chalk.hex(theme.greenMute)(`${toolCount} tool call${toolCount === 1 ? "" : "s"}`)}`,
      )
    }

    // Expand the block: list each thought's reasoning + tool calls. Group
    // consecutive identical tool calls so a tight loop doesn't spam the view.
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
        const grouped = this.groupTools(thought.tools)
        for (const [toolName, argsList] of grouped) {
          const lastArg = argsList[argsList.length - 1]
          if (argsList.length <= 1) {
            lines.push(
              `${indent}   ${toolLabel(toolName, lastArg ? JSON.parse(lastArg) : undefined)}`,
            )
          } else {
            lines.push(
              `${indent}   ${formatToolGroup(toolName, argsList.length, lastArg)}`,
            )
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

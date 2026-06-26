import chalk from "chalk"
import { theme, formatTokenCount, heavyDivider } from "src/cli/utils/tui.ts"



export interface ContextState{
    modelName: string
    contextWindow: number
    sessionTokens: number
    messageCount: number
    lastUsage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }
    lastElapsed?: number
    sessionStartTime: number
    mode: string
}

// elapsedStr(start) → "2m 34s"
//
// Converts a starting timestamp into a human-readable elapsed duration.
// Falls through hr→min→sec so short sessions show "5s" and long ones
// show "1h 12m 3s" without awkward zero values.
//
// Why hand-roll instead of using a library?
//   - The CLI already avoids date libs (zero dep overhead)
//   - This is a ~10-line function with a single caller
//   - Node's Date API + integer math is sufficient here
//
function elapsedStr(start: number): string {
    // Total milliseconds since start
    const ms = Date.now() - start
    // Floor-divide down through seconds → minutes → hours
    const secs = Math.floor(ms / 1000)
    const mins = Math.floor(secs / 60)
    const hrs = Math.floor(mins / 60)
  
    // Only include units with non-zero values, dropping granularity
    // as duration increases (hours don't show seconds, minutes don't show ms)
    if (hrs > 0) return `${hrs}h ${mins % 60}m ${secs % 60}s`
    if (mins > 0) return `${mins}m ${secs % 60}s`
    return `${secs}s`
  }
  
  // progressBar(pct, width) → "████░░░░  33%"
//
// Draws a visual bar using block characters: █ (filled) and ░ (empty).
// The ratio of filled:empty is proportional to pct of `width` columns.
//
// Why block chars instead of a spinner / partial chars?
//   - █ and ░ are monospace and align perfectly in terminals
//   - They're supported in every modern terminal (no Unicode issues)
//   - The phosphor-green theme uses color to reinforce the ratio
//
function progressBar(pct: number, width: number): string {
    // Number of filled cells (rounded, so at small widths the bar is approximate)
    const filled = Math.round((pct / 100) * width)
    // Remaining cells (clamped to 0 in case pct rounds to > 100)
    const empty = width - filled
  
    // Green filled blocks for the "used" portion
    const fill = chalk.hex(theme.green)("█".repeat(filled))
    // Dim green dots for the "available" portion
    const rest = chalk.hex(theme.greenDim)("░".repeat(Math.max(0, empty)))
  
    return fill + rest
  }
  
  // ──────── STYLING SHORTHANDS ────────
//
// These are small wrapper functions that save typing and ensure consistent
// styling across every line in the breakdown. Each wraps chalk with a
// specific theme color and a fixed label width (18 chars).
//
// - label: left-column titles (right-padded to 18 for alignment)
// - value: right-column data values (plain text color)
// - dim:  secondary/annotation text like "tokens" and separators
// - amber: numbers that deserve attention (token counts, percentages)
//
// Why 18 chars? It's the longest label ("Max Context"/"Output Tokens")
// + 2 chars padding, so all values start at column 21.
//
const label = (s: string) => chalk.hex(theme.greenGlow)(s.padEnd(18))
const value = (s: string) => chalk.hex(theme.text)(s)
const dim = (s: string) => chalk.hex(theme.greenDim)(s)
const amber = (s: string) => chalk.hex(theme.amber)(s)


// ──────── MAIN RENDERER ────────

// renderContextBreakdown(state)
//
// The single public entry point. Accepts a ContextState snapshot and writes
// the formatted breakdown directly to stdout.
//
// Why write to stdout directly instead of returning a string?
//   - The existing TUI utilities (frame, sectionHeader, heavyDivider) all
//     write to stdout — consistency
//   - The chat loop expects side effects for slash command rendering
//     (see /help which also calls renderHelp() → stdout)
//   - Building a string then writing once is still fine; we assemble it
//     in `lines[]` and write it in one shot at the end
//
export function renderContextBreakdown(state: ContextState) {
    // ── Terminal width detection ──
    //
    // process.stdout.columns gives the current terminal width.
    // ?? 80 is a safe fallback for non-TTY environments (piped output, tests).
    //
    const w = process.stdout.columns ?? 80
  
    // innerW: usable width minus the box frame border (3 chars left + 3 right)
    // Math.max(40, ...) prevents absurdly narrow boxes on tiny terminals.
    const innerW = Math.max(40, w - 6)
  
    // ── Compute derived values ──
    //
    // pct: what fraction of the context window has been used (0–100).
    //   - Divided by contextWindow (could be 1M+), then rounded.
    //   - Clamped at 100% in case sessionTokens exceeds window (edge case).
    //
    const pct = state.contextWindow > 0
      ? Math.min(100, Math.round((state.sessionTokens / state.contextWindow) * 100))
      : 0
  
    // available: tokens remaining in the context window.
    //   - Math.max(0, ...) prevents negative values.
    //
    const available = Math.max(0, state.contextWindow - state.sessionTokens)
  
    // ── Build content lines ──
    //
    // We push formatted strings into an array, then join them at the end.
    // This lets us conditionally add sections (like the "Last Response" block
    // which only appears if lastUsage is defined).
    //
    const lines: string[] = []
  
    // Blank line for top padding inside the box
    lines.push("")
  
    // ── Model & Context rows ──
    //
    // Each row: label (18 chars) + value + optional annotation.
    // The label/value helpers apply consistent colors from the helper fns above.
    //
    // Line 1: Model name
    lines.push(`  ${label("Model")}     ${value(state.modelName)}`)
    // Line 2: Max context (formatted like "128K" or "1M")
    lines.push(`  ${label("Max Context")}  ${value(formatTokenCount(state.contextWindow))} ${dim("tokens")}`)
    // Line 3: Used tokens + percentage (amber for attention)
    lines.push(`  ${label("Used")}       ${amber(formatTokenCount(state.sessionTokens))} ${dim("tokens")}  ${amber(`(${pct}%)`)}`)
    // Line 4: Available tokens + percentage (dim, less important)
    lines.push(`  ${label("Available")}  ${value(formatTokenCount(available))} ${dim("tokens")}  ${dim(`(${100 - pct}%)`)}`)
  
    lines.push("")
  
    // ── Section separator ──
    //
    // A full-width dim line to visually separate sections within the box.
    // Using repeat(innerW) so it spans the full content width.
    //
    lines.push(`  ${dim("━".repeat(innerW))}`)
    lines.push("")
  
    // ── Session section ──
    //
    lines.push(`  ${label("Messages")}    ${value(String(state.messageCount))}`)
    lines.push(`  ${label("Mode")}        ${value(state.mode)}`)
    // elapsedStr computes the wall-clock duration of the entire session
    lines.push(`  ${label("Session")}     ${value(elapsedStr(state.sessionStartTime))}`)
    lines.push("")
  
    // ── Last Response section (conditional) ──
    //
    // Only shown if there has been at least one AI response (lastUsage is defined).
    // This section is hidden on brand-new sessions, keeping the output clean.
    //
    if (state.lastUsage) {
      lines.push(`  ${dim("━".repeat(innerW))}`)
      lines.push("")
  
      // totalTokens might come directly from the provider, or we compute it
      // as prompt + completion. The ?? chain handles both cases.
      const total = state.lastUsage.totalTokens ??
        (state.lastUsage.promptTokens ?? 0) + (state.lastUsage.completionTokens ?? 0)
  
      lines.push(`  ${label("Input Tokens")}  ${value(formatTokenCount(state.lastUsage.promptTokens ?? 0))}`)
      lines.push(`  ${label("Output Tokens")} ${value(formatTokenCount(state.lastUsage.completionTokens ?? 0))}`)
      lines.push(`  ${label("Total")}       ${amber(formatTokenCount(total))}`)
  
      // Elapsed time for the last response: fast responses show ms, slower ones show seconds
      if (state.lastElapsed !== undefined) {
        const time = state.lastElapsed < 1000
          ? `${state.lastElapsed}ms`
          : `${(state.lastElapsed / 1000).toFixed(1)}s`
        lines.push(`  ${label("Latency")}     ${value(time)}`)
      }
      lines.push("")
    }
  
    // ── Visual progress bar section ──
    //
    // The bar width is capped at 40 chars so it doesn't stretch across the
    // entire terminal on wide screens. The percentage label sits to the right.
    //
    lines.push(`  ${dim("━".repeat(innerW))}`)
    lines.push("")
    const barWidth = Math.min(40, innerW - 8)
    lines.push(`  ${progressBar(pct, barWidth)}  ${amber(`${pct}%`)}`)
    lines.push("")
  
    // ── Build the outer box ──
    //
    // The box uses Unicode box-drawing characters (┏ ┓ ┛ ━) to create a
    // framed panel. This matches the existing TUI aesthetic (see frame(),
    // sectionHeader() in tui.ts).
    //
    // Top border: "┏━━ Context Window ━━<fill>┓"
    //   - Fixed title in the center-left, then dim fill to the right edge
    //
    const content = lines.join("\n")
  
    // Construct the title section of the top border
    const title = `${dim("┏━━")} ${chalk.hex(theme.green).bold("Context Window")} ${dim("━━")}`
    const titlePart = chalk.hex(theme.green)(`${title}`)
    const titleVisible = title.length
    const topFill = Math.max(0, w - titleVisible - 1)
  
    // top: full top border line
    const top = chalk.hex(theme.green)(titlePart) + chalk.hex(theme.greenDim)("━".repeat(topFill)) + chalk.hex(theme.green)("┓")
  
    // bottom: full bottom border line (just fill + corner)
    const bottom = chalk.hex(theme.greenDim)("━".repeat(w - 2)) + chalk.hex(theme.green)("┛")
  
    // ── Write to stdout ──
    //
    // Single write call (one I/O operation) for the entire box.
    // \r\n ensures correct behavior on both Unix and Windows terminals.
    //
    process.stdout.write(`\r\n${top}\r\n${content}\r\n${bottom}\r\n`)
  }
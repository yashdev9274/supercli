//
// File-edit snapshots for the chat TUI.
//
// When a file-changing tool (`write_file`, `edit_file`, `run_command`)
// completes, we render its result inline under the tool's chip row in the
// per-step `Thought` block — not as a one-line "wrote file" message, but as
// an actual editor view the user can scan to confirm what changed.
//
// Visual language (matches the existing `┃` rail used everywhere else):
//
//   ┃   WRITE  test-supercode/hello.md
//   ┃     + test-supercode/hello.md     220 B · replaced
//   ┃      1 # Hello
//   ┃      2
//   ┃      3 hello from supercode
//   ┃      4 im yash
//   ┃
//   ┃   EDIT   test-supercode/hello.md
//   ┃     ~ test-supercode/hello.md     +6 / −0 · 1 replacement
//   ┃     - im yash
//   ┃     + im yash
//   ┃     + ## Python hello
//   ┃     + def hello_world():
//   ┃
//   ┃   BASH   mkdir -p test-supercode
//   ┃     $ mkdir -p test-supercode     exit 0 · 0.3s
//   ┃
//
// Inspired by OpenCode's per-tool rendering
// (https://github.com/anomalyco/opencode — packages/opencode/src/cli/cmd/run/tool.ts).
//

import chalk from "chalk"
import { theme } from "./tui"
import { highlightLine, detectLanguage, renderGitDiff, codeBlockEditor } from "./code-highlighter"

const RAIL = chalk.hex(theme.greenDim)("┃")
const SUB = chalk.hex(theme.greenDim)("·")
const PLUS = chalk.hex("#5ec27e")("+")
const MINUS = chalk.hex("#e06c75")("-")
const CONTEXT = chalk.hex(theme.greenMute)(" ")

const MAX_LINES = 24
const MAX_COLS = 120

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + "…"
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

const DIFF_HEADER_RE = /^(diff --git |index |new file|deleted file|--- a\/|\+\+\+ b\/|@@ |rename)/
const DIFF_LINE_RE = /^[+-]/

/**
 * Compact unified diff between two strings. Returns an array of {kind, text}
 * where kind is "add" | "del" | "ctx". Uses LCS via DP — O(n*m); fine for the
 * small files the agent edits.
 *
 * Enhanced with:
 * - Better context handling around changes
 * - Word-level diff within changed lines for better visualization
 * - Line numbers for changed lines
 */
export function diffLines(before: string, after: string): Array<{ kind: "add" | "del" | "ctx"; text: string; oldNum?: number; newNum?: number }> {
  const a = before.split("\n")
  const b = after.split("\n")
  const m = a.length
  const n = b.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      const rowNext = dp[i + 1]
      const rowCur = dp[i]
      if (!rowNext || !rowCur) continue
      const ai = a[i] ?? ""
      const bj = b[j] ?? ""
      const dn = rowNext[j + 1] ?? 0
      if (ai === bj) rowCur[j] = dn + 1
      else rowCur[j] = Math.max(rowNext[j] ?? 0, rowCur[j + 1] ?? 0)
    }
  }

  const out: Array<{ kind: "add" | "del" | "ctx"; text: string; oldNum?: number; newNum?: number }> = []
  let i = 0
  let j = 0
  let oldLineNum = 1
  let newLineNum = 1
  
  while (i < m && j < n) {
    const ai = a[i] ?? ""
    const bj = b[j] ?? ""
    if (ai === bj) {
      out.push({ kind: "ctx", text: ai, oldNum: oldLineNum, newNum: newLineNum })
      i++
      j++
      oldLineNum++
      newLineNum++
      continue
    }
    const downRow = dp[i + 1]
    const curRow = dp[i]
    const down = downRow && j < downRow.length ? (downRow[j] ?? 0) : 0
    const right = curRow && j + 1 < curRow.length ? (curRow[j + 1] ?? 0) : 0
    if (down >= right) {
      out.push({ kind: "del", text: ai, oldNum: oldLineNum })
      i++
      oldLineNum++
    } else {
      out.push({ kind: "add", text: bj, newNum: newLineNum })
      j++
      newLineNum++
    }
  }
  while (i < m) {
    out.push({ kind: "del", text: a[i] ?? "", oldNum: oldLineNum })
    i++
    oldLineNum++
  }
  while (j < n) {
    out.push({ kind: "add", text: b[j] ?? "", newNum: newLineNum })
    j++
    newLineNum++
  }
  return out
}

/**
 * Render a `write_file` snapshot — header + bordered code view.
 *
 * `meta` is the secondary right-side text (e.g. "220 B · replaced").
 *
 * Enhanced with:
 * - Full code block editor with borders
 * - File name and language indicator in header
 * - Line numbers with proper padding
 * - Bottom border with line count
 */
export function renderWriteSnapshot(path: string, content: string, meta?: string): string[] {
  const lang = detectLanguage(path)
  const lines: string[] = []
  
  // Use codeBlockEditor for a polished bordered view
  const codeLines = codeBlockEditor(content, {
    language: lang,
    filePath: path,
    maxLines: MAX_LINES,
    maxCols: MAX_COLS,
    rail: RAIL,
    indent: 5,
  })
  
  // Add metadata line if provided
  if (meta) {
    lines.push(`${RAIL}     ${chalk.hex(theme.muted)(meta)}`)
  }
  
  // Add the code block
  lines.push(...codeLines)
  
  return lines
}

/**
 * Render an `edit_file` snapshot — unified diff (oldText vs newText).
 *
 * `meta` carries the counts (e.g. "+6 / −0 · 1 replacement").
 *
 * Enhanced with:
 * - Better context around changes (2 lines before/after)
 * - Collapsible unchanged sections with fold indicator
 * - Improved line highlighting for changed lines
 * - Side-by-side visual indicators
 */
export function renderEditSnapshot(path: string, before: string, after: string, meta?: string): string[] {
  const lang = detectLanguage(path)
  const lines: string[] = []
  const headerRight = meta ? `     ${chalk.hex(theme.muted)(meta)}` : ""
  lines.push(`${RAIL}     ${chalk.hex("#f0b87c").bold(`~ ${path}`)}${headerRight}`)

  const diff = diffLines(before, after)
  
  // Find the last non-context line to trim trailing context
  let lastIdx = diff.length - 1
  while (lastIdx >= 0 && diff[lastIdx]?.kind === "ctx") lastIdx--
  const trimmed = diff.slice(0, lastIdx + 1)
  
  // Add context lines around changes (2 lines before/after each change)
  const CONTEXT_LINES = 2
  const changeIndices = new Set<number>()
  
  // Mark lines that are part of changes and their context
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i]?.kind !== "ctx") {
      // Mark this change
      changeIndices.add(i)
      // Mark context before
      for (let j = Math.max(0, i - CONTEXT_LINES); j < i; j++) {
        changeIndices.add(j)
      }
      // Mark context after
      for (let j = i + 1; j < Math.min(trimmed.length, i + CONTEXT_LINES + 1); j++) {
        changeIndices.add(j)
      }
    }
  }
  
  // Build display lines with fold indicators for large context gaps
  const displayLines: Array<{ type: "line" | "fold"; index?: number; line?: typeof trimmed[0] }> = []
  let prevMarked = false
  
  for (let i = 0; i < trimmed.length; i++) {
    if (changeIndices.has(i)) {
      if (!prevMarked && i > 0 && displayLines.length > 0) {
        // Add fold indicator for skipped context
        const skipped = i - (displayLines[displayLines.length - 1]?.index ?? 0) - 1
        if (skipped > 0) {
          displayLines.push({ type: "fold" })
        }
      }
      displayLines.push({ type: "line", index: i, line: trimmed[i] })
      prevMarked = true
    } else {
      prevMarked = false
    }
  }
  
  // Limit total display lines
  const visible = displayLines.length > MAX_LINES ? displayLines.slice(0, MAX_LINES) : displayLines

  let lineNum = 1
  for (const item of visible) {
    if (item.type === "fold") {
      // Show fold indicator for skipped context
      lines.push(`${RAIL}     ${chalk.hex(theme.greenDim)('⋮')} ${chalk.hex(theme.muted)('···')}`)
      continue
    }
    
    const d = item.line!
    const raw = truncate(d.text, MAX_COLS)
    
    // Use the line numbers from the diff for better context
    if (d.kind === "add") {
      const lineNumStr = d.newNum ? String(d.newNum).padStart(3, " ") : String(lineNum).padStart(3, " ")
      const num = chalk.hex(theme.greenDim)(lineNumStr)
      const highlighted = highlightLine(raw, lang)
      // Enhanced add line with background highlight
      lines.push(`${RAIL}     ${chalk.hex("#5ec27e").bold("+")}${num} ${chalk.hex("#c8e6c9")(highlighted)}`)
    } else if (d.kind === "del") {
      const lineNumStr = d.oldNum ? String(d.oldNum).padStart(3, " ") : String(lineNum).padStart(3, " ")
      const num = chalk.hex(theme.greenDim)(lineNumStr)
      const highlighted = highlightLine(raw, lang)
      // Enhanced delete line with red background highlight
      lines.push(`${RAIL}     ${chalk.hex("#e06c75").bold("-")}${num} ${chalk.hex("#f8d7da")(highlighted)}`)
    } else {
      // Context line with subtle styling - show both line numbers if available
      const lineNumStr = d.oldNum && d.newNum 
        ? `${String(d.oldNum).padStart(3, " ")}:${String(d.newNum).padStart(3, " ")}`
        : String(lineNum).padStart(3, " ")
      const num = chalk.hex(theme.greenDim)(lineNumStr)
      lines.push(`${RAIL}     ${chalk.hex(theme.greenDim)(' ')}${num} ${chalk.hex(theme.greenMute)(raw)}`)
    }
    lineNum++
  }
  
  if (displayLines.length > MAX_LINES) {
    lines.push(`${RAIL}     ${SUB} ${chalk.hex(theme.muted)(`… ${displayLines.length - MAX_LINES} more changes`)}`)
  }
  if (displayLines.length === 0) {
    lines.push(`${RAIL}     ${SUB} ${chalk.hex(theme.muted)("(no textual changes)")}`)
  }
  return lines
}

/**
 * Render a `run_command` snapshot — header with exit/duration, then stdout
 * body in muted text.
 */
export function renderCommandSnapshot(
  command: string,
  stdout: string,
  stderr: string,
  exitCode: number,
  durationMs?: number,
): string[] {
  const lines: string[] = []
  const exit = exitCode === 0 ? chalk.hex("#5ec27e")(`exit ${exitCode}`) : chalk.hex(theme.red)(`exit ${exitCode}`)
  const dur = typeof durationMs === "number" ? chalk.hex(theme.muted)(` · ${(durationMs / 1000).toFixed(1)}s`) : ""
  lines.push(`${RAIL}     ${chalk.hex("#a5d6ff").bold(`$ ${truncate(command, MAX_COLS)}`)}     ${exit}${dur}`)

  const body = (stdout || "") + (stderr ? (stdout ? "\n" : "") + stderr : "")
  if (!body.trim()) {
    lines.push(`${RAIL}     ${SUB} ${chalk.hex(theme.muted)("(no output)")}`)
    return lines
  }

  const split = body.split("\n")
  const isGitDiff = split.some((l) => l.startsWith("diff --git ")) &&
    split.some((l) => l.startsWith("@@"))

  if (isGitDiff) {
    lines.push(...renderGitDiff(body, { rail: RAIL, indent: 5, maxLines: MAX_LINES }))
    return lines
  }

  const visible = split.length > MAX_LINES ? split.slice(0, MAX_LINES) : split
  for (const line of visible) {
    lines.push(`${RAIL}       ${truncate(line, MAX_COLS)}`)
  }
  if (split.length > MAX_LINES) {
    lines.push(`${RAIL}     ${SUB} ${chalk.hex(theme.muted)(`… ${split.length - MAX_LINES} more lines`)}`)
  }
  return lines
}

/**
 * Count additions/deletions in a diff result. Useful for the meta line.
 */
export function countDiff(
  diff: Array<{ kind: "add" | "del" | "ctx" }>,
): { adds: number; dels: number } {
  let adds = 0
  let dels = 0
  for (const d of diff) {
    if (d.kind === "add") adds++
    else if (d.kind === "del") dels++
  }
  return { adds, dels }
}

/**
 * Render a `read_file` snapshot — path + first N lines of content.
 */
export function renderReadSnapshot(path: string, content: string): string[] {
  const lang = detectLanguage(path)
  const lines: string[] = []
  lines.push(`${RAIL}     ${chalk.hex("#7a8a82").bold(`📄 ${path}`)}     ${chalk.hex(theme.muted)(`${content.split("\n").length} lines`)}`)

  const split = content.split("\n")
  const padWidth = String(split.length).length
  const visible = split.length > 16 ? split.slice(0, 16) : split

  for (let i = 0; i < visible.length; i++) {
    const num = chalk.hex(theme.greenDim)(String(i + 1).padStart(padWidth, " "))
    const raw = visible[i] ?? ""
    const text = truncate(raw, MAX_COLS)
    const highlighted = highlightLine(text, lang)
    lines.push(`${RAIL}     ${num} ${chalk.hex(theme.greenDim)("│")} ${highlighted}`)
  }
  if (split.length > 16) {
    lines.push(`${RAIL}     ${SUB} ${chalk.hex(theme.muted)(`… ${split.length - 16} more lines`)}`)
  }
  return lines
}

/**
 * Render a `search_files` (grep) snapshot — matches grouped by file.
 */
export function renderSearchSnapshot(
  query: string,
  results: Array<{ file: string; line: number; content: string }>,
  totalCount: number,
): string[] {
  const lines: string[] = []
  lines.push(`${RAIL}     ${chalk.hex("#7a8a82").bold(`🔍 ${query}`)}     ${chalk.hex(theme.muted)(`${totalCount} match${totalCount === 1 ? "" : "es"} in ${new Set(results.map((r) => r.file)).size} file${new Set(results.map((r) => r.file)).size === 1 ? "" : "s"}`)}`)

  // Show up to 4 matches inline
  const visible = results.slice(0, 4)
  for (const r of visible) {
    const loc = chalk.hex(theme.greenDim)(`${r.file}:${r.line}`)
    const text = truncate(r.content, MAX_COLS)
    lines.push(`${RAIL}       ${loc}  ${text}`)
  }
  if (results.length > 4) {
    lines.push(`${RAIL}       ${SUB} ${chalk.hex(theme.muted)(`… ${results.length - 4} more matches`)}`)
  }
  return lines
}

/**
 * Render a `glob` snapshot — matching file paths.
 */
export function renderGlobSnapshot(pattern: string, files: string[]): string[] {
  const lines: string[] = []
  lines.push(`${RAIL}     ${chalk.hex("#7a8a82").bold(`📁 ${pattern}`)}     ${chalk.hex(theme.muted)(`${files.length} file${files.length === 1 ? "" : "s"}`)}`)

  const visible = files.slice(0, 6)
  for (const f of visible) {
    lines.push(`${RAIL}       ${chalk.hex(theme.white)(f)}`)
  }
  if (files.length > 6) {
    lines.push(`${RAIL}       ${SUB} ${chalk.hex(theme.muted)(`… ${files.length - 6} more`)}`)
  }
  return lines
}

/**
 * Render a `web_search` snapshot — search result titles + URLs.
 */
export function renderWebSearchSnapshot(
  query: string,
  results: Array<{ title: string; url?: string }>,
): string[] {
  const lines: string[] = []
  lines.push(`${RAIL}     ${chalk.hex("#5ec27e").bold(`🌐 Search: ${query}`)}     ${chalk.hex(theme.muted)(`${results.length} result${results.length === 1 ? "" : "s"}`)}`)

  const visible = results.slice(0, 4)
  for (const r of visible) {
    lines.push(`${RAIL}       ${chalk.hex(theme.white)(truncate(r.title, MAX_COLS))}`)
    if (r.url) {
      lines.push(`${RAIL}       ${chalk.hex(theme.muted)(truncate(r.url, MAX_COLS))}`)
    }
  }
  if (results.length > 4) {
    lines.push(`${RAIL}       ${SUB} ${chalk.hex(theme.muted)(`… ${results.length - 4} more results`)}`)
  }
  return lines
}

export { formatBytes }
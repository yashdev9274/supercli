import chalk from "chalk"
import boxen from "boxen"
import { theme, stripAnsi } from "./tui"
import { highlightLine, detectLanguage } from "./code-highlighter"

export interface FileViewerOptions {
  filePath: string
  content: string
  language?: string
  lineStart?: number
  lineEnd?: number
  highlightLines?: Set<number>
  scrollHint?: boolean
  title?: string
}

const LINE_NUM_COLOR = theme.greenDim
const LINE_NUM_ACTIVE = theme.greenMute
const GUTTER_WIDTH = 5

export function fileViewer(opts: FileViewerOptions): string {
  const {
    filePath,
    content,
    language: hint,
    lineStart = 1,
    lineEnd,
    highlightLines,
    scrollHint = true,
    title,
  } = opts

  const lang = detectLanguage(filePath, hint)
  const lines = content.split("\n")
  const end = lineEnd ?? lines.length
  const visibleLines = lines.slice(lineStart - 1, end)
  const maxLineNum = end
  const gutterW = Math.max(GUTTER_WIDTH, String(maxLineNum).length + 1)
  const fileName = filePath.split("/").pop() ?? filePath

  const rendered = visibleLines.map((line, idx) => {
    const lineNum = lineStart + idx
    const isHighlighted = highlightLines?.has(lineNum)
    const numColor = isHighlighted ? LINE_NUM_ACTIVE : LINE_NUM_COLOR
    const numStr = String(lineNum).padStart(gutterW - 1) + " "
    const gutter = chalk.hex(numColor)(numStr)
    const hl = isHighlighted ? chalk.bgHex(theme.greenDeep) : (s: string) => s
    const content = hl(highlightLine(line, lang))
    return `${chalk.hex(theme.greenDim)("│")} ${gutter}${content}`
  }).join("\n")

  const lineCount = `${chalk.hex(theme.greenMute)(`${visibleLines.length} lines`)}`
  const fileInfo = `${chalk.hex(theme.green)(fileName)} ${chalk.hex(theme.greenDim)(`· ${lang}`)}`

  const scroll = scrollHint && visibleLines.length >= 30
    ? `\n${chalk.hex(theme.greenDim)("│")} ${" ".repeat(gutterW)}${chalk.hex(theme.greenMute)("⋮")}`
    : ""

  const inner = [rendered, scroll].join("")

  return boxen(inner, {
    padding: { top: 0, bottom: 0, left: 0, right: 0 },
    margin: 0,
    borderStyle: "single",
    borderColor: theme.greenDim,
    title: chalk.hex(theme.green)(` ${title ?? fileName} `),
    titleAlignment: "left",
    float: "left",
  })
}

export function fileBanner(filePath: string, language?: string): string {
  const fileName = filePath.split("/").pop() ?? filePath
  const lang = language ?? filePath.split(".").pop() ?? ""
  return ` ${chalk.hex(theme.amber)("◆")} ${chalk.hex(theme.green).bold(fileName)}${lang ? ` ${chalk.hex(theme.greenDim)(`· ${lang}`)}` : ""}`
}

export function diffLine(line: string, type: "add" | "del" | "same"): string {
  const gutter = type === "add"
    ? chalk.hex(theme.green)("+")
    : type === "del"
      ? chalk.hex(theme.red)("-")
      : " "
  const color = type === "add"
    ? chalk.hex(theme.greenGlow)
    : type === "del"
      ? chalk.hex(theme.red)
      : chalk.hex(theme.greenMute)
  return `${gutter} ${color(line)}`
}

export function diffViewer(original: string, modified: string, filePath?: string): string {
  const origLines = original.split("\n")
  const modLines = modified.split("\n")
  const maxLen = Math.max(origLines.length, modLines.length)
  const lines: string[] = []

  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i]
    const m = modLines[i]
    if (o === undefined) {
      lines.push(diffLine(m!, "add"))
    } else if (m === undefined) {
      lines.push(diffLine(o, "del"))
    } else if (o !== m) {
      lines.push(diffLine(o, "del"))
      lines.push(diffLine(m, "add"))
    } else {
      lines.push(diffLine(o, "same"))
    }
  }

  const fileName = filePath?.split("/").pop() ?? "diff"
  return boxen(lines.join("\n"), {
    padding: { top: 0, bottom: 0, left: 1, right: 1 },
    margin: 0,
    borderStyle: "single",
    borderColor: theme.greenDim,
    title: chalk.hex(theme.amber)(` ${fileName} (diff) `),
    titleAlignment: "left",
    float: "left",
  })
}

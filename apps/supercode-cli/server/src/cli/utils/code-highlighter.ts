import chalk from "chalk"
import { theme } from "./tui"

const KEYWORDS_BY_LANG: Record<string, string[]> = {
  ts: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "import", "export", "from", "async", "await", "class", "interface", "type", "extends", "implements", "new", "this", "super", "try", "catch", "finally", "throw", "typeof", "instanceof", "in", "of", "as", "is", "satisfies", "keyof", "readonly", "enum", "namespace", "declare", "abstract", "private", "protected", "public", "static"],
  js: ["const", "let", "var", "function", "return", "if", "else", "for", "while", "do", "switch", "case", "break", "continue", "import", "export", "from", "async", "await", "class", "extends", "new", "this", "super", "try", "catch", "finally", "throw", "typeof", "instanceof", "delete", "yield", "in", "of"],
  py: ["def", "class", "return", "if", "elif", "else", "for", "while", "import", "from", "as", "try", "except", "finally", "raise", "with", "yield", "lambda", "pass", "break", "continue", "and", "or", "not", "in", "is", "None", "True", "False", "async", "await", "self"],
  rs: ["fn", "let", "mut", "const", "return", "if", "else", "for", "while", "loop", "match", "struct", "enum", "impl", "trait", "pub", "use", "mod", "self", "super", "type", "where", "async", "await", "move", "ref", "static", "unsafe", "dyn", "in"],
  go: ["func", "return", "if", "else", "for", "range", "switch", "case", "break", "continue", "import", "package", "type", "struct", "interface", "map", "chan", "var", "const", "defer", "go", "select", "fallthrough", "default"],
  sh: ["if", "then", "else", "elif", "fi", "for", "while", "do", "done", "case", "esac", "function", "return", "local", "export", "source", "exit", "break", "continue"],
  json: [],
  md: [],
  css: [],
  html: [],
  yaml: [],
  toml: [],
}

const FILE_EXT_MAP: Record<string, string> = {
  ts: "ts", tsx: "ts", js: "js", jsx: "js",
  py: "py", rs: "rs", go: "go", sh: "sh", bash: "sh",
  json: "json", md: "md", css: "css", html: "html",
  yml: "yaml", yaml: "yaml", toml: "toml",
}

export function detectLanguage(filePath: string, hint?: string): string {
  if (hint) return hint
  const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
  return FILE_EXT_MAP[ext] ?? "ts"
}

interface Token {
  type: "keyword" | "string" | "comment" | "number" | "punctuation" | "text"
  value: string
}

function tokenize(line: string, langKeywords: Set<string>): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < line.length) {
    const ch = line[i]!

    if ((ch === "/" && line[i + 1] === "/") || ch === "#") {
      tokens.push({ type: "comment", value: line.slice(i) })
      return tokens
    }

    if (ch === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2)
      if (end !== -1) {
        tokens.push({ type: "comment", value: line.slice(i, end + 2) })
        i = end + 2
        continue
      }
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch
      let j = i + 1
      while (j < line.length) {
        const c = line[j]!
        if (c === "\\") { j += 2; continue }
        if (c === quote) { j++; break }
        j++
      }
      tokens.push({ type: "string", value: line.slice(i, j) })
      i = j
      continue
    }

    if (/\d/.test(ch) && (i === 0 || /[\s,=(\[{+\-*/%|&!:;]/.test(line[i - 1]!))) {
      let j = i
      while (j < line.length && /[\d.eE+\-xXoObBa-fA-F_]/.test(line[j]!)) j++
      tokens.push({ type: "number", value: line.slice(i, j) })
      i = j
      continue
    }

    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i
      while (j < line.length && /[\w$]/.test(line[j]!)) j++
      const word = line.slice(i, j)
      tokens.push({
        type: langKeywords.has(word) ? "keyword" : "text",
        value: word,
      })
      i = j
      continue
    }

    if (/[{}()\[\];:.,<>=+\-*/%!|&^~?@]/.test(ch)) {
      tokens.push({ type: "punctuation", value: ch })
      i++
      continue
    }

    tokens.push({ type: "text", value: ch })
    i++
  }

  return tokens
}

export function highlightLine(line: string, lang: string): string {
  if (lang === "md" || lang === "json" || lang === "css" || lang === "html" || lang === "yaml" || lang === "toml") {
    return chalk.hex(theme.white)(line)
  }

  const keywordsList = KEYWORDS_BY_LANG[lang] || KEYWORDS_BY_LANG.ts!
  const keywordSet = new Set(keywordsList)

  let result = ""
  const tokens = tokenize(line, keywordSet)
  for (const token of tokens) {
    if (token.type === "comment") {
      result += chalk.hex(theme.greenMute)(token.value)
    } else if (token.type === "string") {
      result += chalk.hex(theme.amber)(token.value)
    } else if (token.type === "number") {
      result += chalk.hex(theme.greenGlow)(token.value)
    } else if (token.type === "keyword") {
      result += chalk.hex(theme.green)(token.value)
    } else if (token.type === "punctuation") {
      result += chalk.hex(theme.greenDim)(token.value)
    } else {
      result += chalk.hex(theme.white)(token.value)
    }
  }
  return result
}

export function highlightCode(code: string, lang: string): string {
  return code.split("\n").map((line) => highlightLine(line, lang)).join("\n")
}

export function codeBlockEditor(
  code: string,
  opts?: {
    language?: string
    filePath?: string
    maxLines?: number
    maxCols?: number
    lineStart?: number
    highlightLineNums?: Set<number>
    rail?: string
    indent?: number
  },
): string[] {
  const {
    language = "ts",
    filePath,
    maxLines = 30,
    maxCols = 120,
    lineStart = 1,
    highlightLineNums,
    rail = chalk.hex(theme.greenDim)("┃"),
    indent = 5,
  } = opts ?? {}

  const lines = code.split("\n")
  const totalLines = lines.length
  const padWidth = String(totalLines + lineStart - 1).length
  const indentStr = " ".repeat(indent)
  const out: string[] = []

  const border = chalk.hex(theme.greenDim)
  const white = chalk.hex(theme.white)

  const fileName = filePath?.split("/").pop()
  const visible = totalLines > maxLines ? lines.slice(0, maxLines) : lines

  // ── Top border ──────────────────────────────────────
  const titleParts: string[] = []
  if (fileName) {
    titleParts.push(chalk.hex(theme.green)(fileName))
  }
  if (language) {
    titleParts.push(chalk.hex(theme.amber)(language))
  }
  titleParts.push(chalk.hex(theme.muted)(`${visible.length} line${visible.length === 1 ? "" : "s"}`))
  const titleStr = titleParts.length > 0
    ? ` ${titleParts.join(chalk.hex(theme.greenDim)(" · "))} `
    : ""
  const topBorder = `┌${titleStr}${border("─".repeat(Math.max(2, maxCols - titleStr.length + 1)))}┐`
  out.push(`${rail}${indentStr}${topBorder}`)

  // ── Code lines ──────────────────────────────────────
  for (let i = 0; i < visible.length; i++) {
    const lineNum = lineStart + i
    const numColor = highlightLineNums?.has(lineNum) ? theme.greenMute : theme.greenDim
    const num = chalk.hex(numColor)(String(lineNum).padStart(padWidth, " "))
    const raw = visible[i] ?? ""
    const text = truncate(raw, maxCols)
    const gutter = chalk.hex(theme.greenDim)("┊")
    const highlighted = highlightLine(text, language)
    const padding = " ".repeat(Math.max(0, maxCols - text.length))
    out.push(`${rail}${indentStr}${border("│")} ${num} ${gutter} ${highlighted}${padding} ${border("│")}`)
  }

  if (totalLines > maxLines) {
    const overflow = totalLines - maxLines
    out.push(`${rail}${indentStr}${border("│")} ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.muted)(`… ${overflow} more line${overflow === 1 ? "" : "s"}`)} ${" ".repeat(Math.max(0, maxCols - String(overflow).length - 10))} ${border("│")}`)
  }

  // ── Bottom border ───────────────────────────────────
  const meta = fileName
    ? chalk.hex(theme.green)(fileName)
    : chalk.hex(theme.muted)(`${totalLines} line${totalLines === 1 ? "" : "s"}`)
  const bottomTitle = totalLines > maxLines
    ? chalk.hex(theme.muted)(`${maxLines}/${totalLines} lines`)
    : chalk.hex(theme.muted)(`${totalLines} line${totalLines === 1 ? "" : "s"}`)
  const bottomLabel = ` ${bottomTitle} `
  out.push(`${rail}${indentStr}${border("└")}${border("─".repeat(Math.max(0, maxCols - bottomLabel.length + 1)))}${bottomLabel}${border("┘")}`)

  return out
}

export function renderGitDiff(
  diffOutput: string,
  opts?: {
    maxLines?: number
    rail?: string
    indent?: number
  },
): string[] {
  const {
    maxLines = 40,
    rail = chalk.hex(theme.greenDim)("┃"),
    indent = 5,
  } = opts ?? {}

  const indentStr = " ".repeat(indent)
  const out: string[] = []
  const lines = diffOutput.split("\n")
  const visible = lines.length > maxLines ? lines.slice(0, maxLines) : lines
  const border = chalk.hex(theme.greenDim)

  // ── Top border ──────────────────────────────────────
  const titleStr = chalk.hex(theme.amber)(" diff ") + chalk.hex(theme.muted)(`${lines.length} line${lines.length === 1 ? "" : "s"}`)
  const topPad = Math.max(2, 80 - titleStr.length + 1)
  out.push(`${rail}${indentStr}${border("┌")}${titleStr} ${border("─".repeat(topPad))}${border("┐")}`)

  for (let i = 0; i < visible.length; i++) {
    const line = visible[i] ?? ""

    if (line.startsWith("diff --git")) {
      const parts = line.match(/diff --git a\/(.*) b\/(.*)/)
      const file = parts?.[1] ?? line
      out.push(`${rail}${indentStr}${border("│")} ${chalk.hex(theme.amber).bold("─── ")}${chalk.hex(theme.green).bold(file)}${" ".repeat(Math.max(0, 76 - file.length))} ${border("│")}`)
      continue
    }

    if (line.startsWith("--- a/") || line.startsWith("+++ b/")) {
      out.push(`${rail}${indentStr}${border("│")}   ${chalk.hex(theme.greenDim)(line)}${" ".repeat(Math.max(0, 74 - line.length))} ${border("│")}`)
      continue
    }

    if (line.startsWith("@@")) {
      out.push(`${rail}${indentStr}${border("│")}   ${chalk.hex(theme.greenMute)(line)}${" ".repeat(Math.max(0, 74 - line.length))} ${border("│")}`)
      continue
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      const text = chalk.hex("#c8e6c9")(line.slice(1))
      out.push(`${rail}${indentStr}${border("│")} ${chalk.hex("#5ec27e")("+")} ${text}${" ".repeat(Math.max(0, 74 - line.length))} ${border("│")}`)
      continue
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      const text = chalk.hex("#f8d7da")(line.slice(1))
      out.push(`${rail}${indentStr}${border("│")} ${chalk.hex("#e06c75")("-")} ${text}${" ".repeat(Math.max(0, 74 - line.length))} ${border("│")}`)
      continue
    }

    if (line.startsWith("index ") || line.startsWith("new file") || line.startsWith("deleted file")) {
      out.push(`${rail}${indentStr}${border("│")}   ${chalk.hex(theme.greenDim)(line)}${" ".repeat(Math.max(0, 74 - line.length))} ${border("│")}`)
      continue
    }

    out.push(`${rail}${indentStr}${border("│")}   ${chalk.hex(theme.greenMute)(line)}${" ".repeat(Math.max(0, 74 - line.length))} ${border("│")}`)
  }

  if (lines.length > maxLines) {
    out.push(`${rail}${indentStr}${border("│")}   ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.muted)(`… ${lines.length - maxLines} more lines`)}${" ".repeat(Math.max(0, 62))} ${border("│")}`)
  }

  // ── Bottom border ───────────────────────────────────
  const bottomLabel = chalk.hex(theme.muted)(`${Math.min(lines.length, maxLines)}/${lines.length} lines`)
  const bottomPad = Math.max(0, 78 - bottomLabel.length)
  out.push(`${rail}${indentStr}${border("└")}${border("─".repeat(bottomPad))} ${bottomLabel} ${border("┘")}`)

  return out
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s
  return s.slice(0, max - 1) + "…"
}

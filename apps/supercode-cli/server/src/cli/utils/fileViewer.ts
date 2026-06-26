import chalk from "chalk"
import boxen from "boxen"
import { theme, stripAnsi } from "./tui"

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
}

const FILE_EXT_MAP: Record<string, string> = {
  ts: "ts", tsx: "ts", js: "js", jsx: "js",
  py: "py", rs: "rs", go: "go", sh: "sh", bash: "sh",
  json: "json", md: "md", css: "css", html: "html",
  yml: "json", yaml: "json", toml: "json",
}

function detectLanguage(filePath: string, hint?: string): string {
  if (hint) return hint
  const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
  return FILE_EXT_MAP[ext] ?? "ts"
}

function highlightLine(line: string, lang: string): string {
  if (lang === "md" || lang === "json" || lang === "css" || lang === "html") {
    return chalk.hex(theme.white)(line)
  }

  const keywordsList = KEYWORDS_BY_LANG[lang] || KEYWORDS_BY_LANG.ts!
  const keywordSet = new Set(keywordsList)

  let result = ""
  const tokens = tokenize(line)
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

interface Token {
  type: "keyword" | "string" | "comment" | "number" | "punctuation" | "text"
  value: string
}

function tokenize(line: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const keywords = new Set<string>()

  while (i < line.length) {
    const ch = line[i]!

    // Single-line comment (// or #)
    if ((ch === "/" && line[i + 1] === "/") || ch === "#") {
      tokens.push({ type: "comment", value: line.slice(i) })
      return tokens
    }

    // Block comment /* ... */
    if (ch === "/" && line[i + 1] === "*") {
      const end = line.indexOf("*/", i + 2)
      if (end !== -1) {
        tokens.push({ type: "comment", value: line.slice(i, end + 2) })
        i = end + 2
        continue
      }
    }

    // Strings (double, single, backtick)
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

    // Numbers
    if (/\d/.test(ch) && (i === 0 || /[\s,=(\[{+\-*/%|&!:;]/.test(line[i - 1]!))) {
      let j = i
      while (j < line.length && /[\d.eE+\-xXoObBa-fA-F_]/.test(line[j]!)) j++
      tokens.push({ type: "number", value: line.slice(i, j) })
      i = j
      continue
    }

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i
      while (j < line.length && /[\w$]/.test(line[j]!)) j++
      const word = line.slice(i, j)
      const kw = [...(KEYWORDS_BY_LANG.ts ?? []), ...(KEYWORDS_BY_LANG.js ?? [])]
      keywords.clear()
      for (const k of kw) keywords.add(k)

      tokens.push({
        type: keywords.has(word) ? "keyword" : "text",
        value: word,
      })
      i = j
      continue
    }

    // Punctuation / operators
    if (/[{}()\[\];:.,<>=+\-*/%!|&^~?@]/.test(ch)) {
      tokens.push({ type: "punctuation", value: ch })
      i++
      continue
    }

    // Everything else (whitespace, etc.)
    tokens.push({ type: "text", value: ch })
    i++
  }

  return tokens
}

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

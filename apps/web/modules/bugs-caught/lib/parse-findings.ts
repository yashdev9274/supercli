export type CodeSnippet = {
  language: string
  code: string
  kind: "issue" | "fix" | "diff" | "code"
}

export type ParsedFinding = {
  severity: string
  title: string
  filePath: string
  description: string
  snippets: CodeSnippet[]
}

function inferSnippetKind(
  language: string,
  precedingText: string,
  index: number,
): CodeSnippet["kind"] {
  const ctx = precedingText.toLowerCase()
  if (
    language === "diff" ||
    ctx.includes("diff") ||
    ctx.includes("patch")
  ) {
    return "diff"
  }
  if (
    ctx.includes("suggested fix") ||
    ctx.includes("fix:") ||
    ctx.includes("after") ||
    ctx.includes("recommended") ||
    ctx.includes("should be") ||
    ctx.includes("instead")
  ) {
    return "fix"
  }
  if (
    ctx.includes("before") ||
    ctx.includes("current") ||
    ctx.includes("problematic") ||
    ctx.includes("buggy") ||
    ctx.includes("issue")
  ) {
    return "issue"
  }
  // Heuristic: first fence under a finding is often the issue; later is the fix
  return index === 0 ? "issue" : "fix"
}

/**
 * Extract the Findings / Bugs Found / Issues section from a full review.
 */
export function extractFindingsSection(content: string): string {
  const patterns = [
    /##+\s*Findings[\s\S]*?(?=##+\s|$)/i,
    /##+\s*Bugs Found[\s\S]*?(?=##+\s|$)/i,
    /##+\s*Issues[\s\S]*?(?=##+\s|$)/i,
  ]

  for (const pattern of patterns) {
    const match = content.match(pattern)
    if (match) return match[0].trim()
  }

  return content
}

/**
 * Parse structured findings from review markdown.
 * Supports multiple code fences per finding (issue + suggested fix).
 */
export function parseFindings(findingsText: string): ParsedFinding[] {
  const items: ParsedFinding[] = []
  const lines = findingsText.split("\n")

  let current: ParsedFinding | null = null
  let inCodeBlock = false
  let codeLang = ""
  let codeLines: string[] = []
  let textBeforeFence = ""
  let fenceIndex = 0

  const flushFence = () => {
    if (!current) return
    const code = codeLines.join("\n").replace(/\n$/, "")
    if (!code.trim()) return
    current.snippets.push({
      language: codeLang || "text",
      code,
      kind: inferSnippetKind(codeLang, textBeforeFence, fenceIndex),
    })
    fenceIndex += 1
    codeLines = []
    codeLang = ""
    textBeforeFence = ""
  }

  for (const rawLine of lines) {
    const line = rawLine
    // Allow indented fences (common under nested list findings)
    const fenceOpen = line.match(/^\s*```([\w+-]*)\s*$/)
    if (fenceOpen) {
      if (inCodeBlock) {
        flushFence()
        inCodeBlock = false
      } else {
        inCodeBlock = true
        codeLang = (fenceOpen[1] || "").toLowerCase()
        codeLines = []
      }
      continue
    }

    if (inCodeBlock) {
      // Strip one level of common indent from fenced content when present
      codeLines.push(line.replace(/^ {0,4}/, ""))
      continue
    }

    // - **[severity] title** — path
    // - [severity] title — path
    const findingMatch = line.match(
      /^[-*]\s*\*{0,2}\[(\w+)\]\s*(.+?)\*{0,2}\s*[—–-]\s*`?([^`\n]+)`?\s*$/i,
    )
    if (findingMatch) {
      if (current) items.push(current)
      current = {
        severity: findingMatch[1].toLowerCase(),
        title: findingMatch[2].replace(/\*{1,2}/g, "").trim(),
        filePath: findingMatch[3].trim(),
        description: "",
        snippets: [],
      }
      fenceIndex = 0
      textBeforeFence = ""
      continue
    }

    if (current && line.trim() && !line.startsWith("#")) {
      // Track recent prose for snippet kind inference
      textBeforeFence = `${textBeforeFence} ${line}`.slice(-240)

      const cleaned = line.trim()
      // Skip pure "Suggested fix" labels — shown in UI chrome instead
      if (/^(suggested\s+fix|fix|before|after)\s*:?\s*$/i.test(cleaned)) {
        continue
      }

      if (current.description) {
        current.description += " " + cleaned
      } else {
        current.description = cleaned
      }
    }
  }

  if (inCodeBlock) flushFence()
  if (current) items.push(current)

  // If a finding has a single fence and prose mentions fix, label as fix
  for (const item of items) {
    if (item.snippets.length === 1) {
      const desc = item.description.toLowerCase()
      if (
        desc.includes("suggested fix") ||
        desc.includes("fix:") ||
        item.snippets[0].language === "diff"
      ) {
        item.snippets[0].kind =
          item.snippets[0].language === "diff" ? "diff" : "fix"
      }
    }
  }

  return items
}

export function severityRank(severity: string) {
  const order: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    nit: 4,
    info: 5,
  }
  return order[severity] ?? 6
}

export function languageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "tsx",
    js: "javascript",
    jsx: "jsx",
    mjs: "javascript",
    cjs: "javascript",
    py: "python",
    rs: "rust",
    go: "go",
    rb: "ruby",
    java: "java",
    kt: "kotlin",
    swift: "swift",
    css: "css",
    scss: "scss",
    html: "html",
    json: "json",
    yml: "yaml",
    yaml: "yaml",
    md: "markdown",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
  }
  return map[ext] ?? (ext || "text")
}

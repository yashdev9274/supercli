/**
 * Render code/diff/stdout snapshots under tool rows (OpenCode-style).
 */
import {
  renderWriteSnapshot,
  renderEditSnapshot,
  renderCommandSnapshot,
  renderReadSnapshot,
  renderSearchSnapshot,
  renderGlobSnapshot,
  renderWebSearchSnapshot,
  formatBytes,
  diffLines,
  countDiff,
} from "src/cli/utils/tool-snapshot.ts"

export function captureToolSnapshot(toolName: string, args: unknown, resultRaw: string): string[] {
  try {
    if (toolName === "write_file") {
      const a = (args ?? {}) as { path?: string; content?: string }
      if (typeof a.path === "string" && typeof a.content === "string") {
        const meta = `${formatBytes(a.content.length)} · written`
        return renderWriteSnapshot(a.path, a.content, meta)
      }
      return []
    }

    if (toolName === "edit_file") {
      const a = (args ?? {}) as { path?: string; oldText?: string; newText?: string }
      if (typeof a.path === "string" && typeof a.oldText === "string" && typeof a.newText === "string") {
        const diff = diffLines(a.oldText, a.newText)
        const { adds, dels } = countDiff(diff)
        const meta = `${formatBytes(a.newText.length)} · +${adds} / −${dels}`
        return renderEditSnapshot(a.path, a.oldText, a.newText, meta)
      }
      return []
    }

    if (toolName === "run_command") {
      const a = (args ?? {}) as { command?: string }
      const parsed = (() => {
        try {
          return JSON.parse(resultRaw)
        } catch {
          return null
        }
      })()
      if (parsed && typeof parsed === "object") {
        const result = (parsed as any).success === true && (parsed as any).data && typeof (parsed as any).data === "object"
          ? (parsed as any).data
          : parsed
        const stdout = typeof (result as any).stdout === "string" ? (result as any).stdout : ""
        const stderr = typeof (result as any).stderr === "string" ? (result as any).stderr : ""
        const exitCode = typeof (result as any).exitCode === "number" ? (result as any).exitCode : 0
        return renderCommandSnapshot(a.command ?? "", stdout, stderr, exitCode)
      }
      return []
    }

    if (toolName === "read_file") {
      const a = (args ?? {}) as { path?: string }
      if (typeof a.path === "string" && resultRaw.trim()) {
        // read_file returns the file content directly as a string
        return renderReadSnapshot(a.path, resultRaw)
      }
      return []
    }

    if (toolName === "search_files") {
      const a = (args ?? {}) as { pattern?: string }
      try {
        const parsed = JSON.parse(resultRaw)
        if (Array.isArray(parsed)) {
          return renderSearchSnapshot(
            a.pattern ?? "",
            parsed.map((r: any) => ({
              file: typeof r.file === "string" ? r.file : String(r.file ?? ""),
              line: typeof r.line === "number" ? r.line : 0,
              content: typeof r.content === "string" ? r.content : String(r.content ?? ""),
            })),
            parsed.length,
          )
        }
      } catch { /* best-effort */ }
      return []
    }

    if (toolName === "glob") {
      const a = (args ?? {}) as { pattern?: string }
      try {
        const parsed = JSON.parse(resultRaw)
        if (Array.isArray(parsed)) {
          return renderGlobSnapshot(a.pattern ?? "", parsed.map(String))
        }
      } catch { /* best-effort */ }
      return []
    }

    if (toolName === "web_search") {
      const a = (args ?? {}) as { query?: string }
      try {
        const parsed = JSON.parse(resultRaw)
        const results = Array.isArray(parsed) ? parsed : (parsed as any)?.results ?? []
        if (Array.isArray(results)) {
          return renderWebSearchSnapshot(
            a.query ?? "",
            results.map((r: any) => ({
              title: typeof r.title === "string" ? r.title : String(r.title ?? ""),
              url: typeof r.url === "string" ? r.url : undefined,
            })),
          )
        }
      } catch { /* best-effort */ }
      return []
    }

    if (toolName === "exa_search" || toolName === "exa_fetch" || toolName === "firecrawl_search" || toolName === "firecrawl_scrape" || toolName === "firecrawl_map") {
      const a = (args ?? {}) as { query?: string; url?: string }
      try {
        const parsed = JSON.parse(resultRaw)
        const results = Array.isArray(parsed) ? parsed : (parsed as any)?.data ?? (parsed as any)?.results ?? []
        if (Array.isArray(results)) {
          return renderWebSearchSnapshot(
            a.query ?? a.url ?? "",
            results.map((r: any) => ({
              title: typeof r.title === "string" ? r.title : typeof r.url === "string" ? r.url : String(r ?? ""),
              url: typeof r.url === "string" ? r.url : undefined,
            })),
          )
        }
      } catch { /* best-effort */ }
      return []
    }

    if (toolName === "url_fetch") {
      const a = (args ?? {}) as { url?: string }
      try {
        const parsed = JSON.parse(resultRaw)
        return renderReadSnapshot(
          a.url ?? "",
          typeof parsed === "string" ? parsed : (parsed as any)?.content ?? (parsed as any)?.markdown ?? JSON.stringify(parsed),
        )
      } catch {
        return renderReadSnapshot(a.url ?? "", resultRaw)
      }
    }
  } catch {
    // Snapshot is best-effort. Never let a render bug break the chat loop.
  }
  return []
}


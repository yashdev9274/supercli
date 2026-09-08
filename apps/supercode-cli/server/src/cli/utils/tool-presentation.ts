import { sanitizeTerminalText, wrapTerminalText } from "./terminal-text"

export type ToolStatus = "running" | "completed" | "failed" | "denied" | "cancelled"
export type ToolInvocation = {
  id: string
  number: number
  name: string
  args: unknown
  category: string
  operation: string
  startedAt: number
  endedAt?: number
  status: ToolStatus
  output: string
  references: string[]
}
const categories: Record<string, string> = {
  run_command: "SHELL", bash: "SHELL", shell: "SHELL",
  read_file: "READ", write_file: "WRITE", edit_file: "EDIT",
  resolve_file_reference: "FILE LOOKUP",
  search_files: "FILE SEARCH", grep: "FILE SEARCH", glob: "FILE SEARCH",
  list_files: "FILE LIST", list_directory: "FILE LIST",
  web_search: "WEB SEARCH", exa_search: "WEB SEARCH", firecrawl_search: "WEB SEARCH",
  web_fetch: "WEB FETCH", fetch_url: "WEB FETCH", url_fetch: "WEB FETCH", exa_fetch: "WEB FETCH", firecrawl_scrape: "WEB FETCH",
  firecrawl_map: "WEB SEARCH", read_instructions: "READ", skill: "READ",
  delegate: "AGENT", task: "AGENT", question: "QUESTION", ask_question: "QUESTION",
  todowrite: "TASKS", todoread: "TASKS",
}
export const toolCategory = (name: string): string => categories[name] ?? "TOOL"
const record = (v: unknown): Record<string, any> => v !== null && typeof v === "object" && !Array.isArray(v) ? v : {}
function parse(v: unknown): unknown {
  if (typeof v !== "string") return v
  try { return JSON.parse(v) } catch { return v }
}
function text(v: unknown): string {
  return sanitizeTerminalText(typeof v === "string" ? v : v == null ? "" : JSON.stringify(v, null, 2))
}
function key(v: unknown): string {
  const parsed = parse(v)
  if (Array.isArray(parsed)) return `[${parsed.map(key).join(",")}]`
  if (parsed && typeof parsed === "object") return `{${Object.entries(parsed).sort(([a], [b]) => a.localeCompare(b)).map(([k, value]) => `${k}:${key(value)}`).join(",")}}`
  return JSON.stringify(parsed) ?? "null"
}
export function toolOperation(name: string, args: unknown): string {
  const a = record(parse(args))
  const category = toolCategory(name)
  if (category === "SHELL") return `${text(a.command)}\ncwd: ${text(a.cwd ?? ".")}`
  if (category === "READ") return `${text(a.path ?? a.file_path ?? a.name ?? a.skill ?? a.skillName ?? name)}${a.startLine ? ` · from line ${a.startLine}` : ""}${a.maxLines ? ` · up to ${a.maxLines} lines` : ""}`
  if (category === "WRITE" || category === "EDIT") return text(a.path ?? a.file_path)
  return Object.entries(a).map(([k, v]) => `${k}: ${text(v)}`).join("\n") || name
}

export function normalizeToolResult(name: string, args: unknown, result: unknown): Pick<ToolInvocation, "status" | "output" | "references"> {
  const parsed = parse(result)
  const envelope = record(parsed)
  const data = envelope.data ?? parsed
  const d = record(data)
  const a = record(parse(args))
  const category = toolCategory(name)
  const error = text(envelope.error ?? d.error ?? envelope.reason ?? d.reason)
  const denied = envelope.denied === true || /permission denied|user denied|not allowed by.*ruleset/i.test(error)
  const cancelled = envelope.cancelled === true || d.cancelled === true || d.aborted === true || d.status === "cancelled"
  const failed = envelope.success === false || d.success === false || envelope.isError === true || !!envelope.error || d.timedOut === true || (typeof d.exitCode === "number" && d.exitCode !== 0) || !!d.signal
  const status: ToolStatus = denied ? "denied" : cancelled ? "cancelled" : failed ? "failed" : "completed"
  const references: string[] = []
  if (d.logPath) references.push(`Retained log: ${text(d.logPath)}${d.logTruncated ? " (log limit reached)" : ""}`)
  if (d.truncated || d.stdoutTruncated || d.stderrTruncated) references.push(`Runtime output truncated${d.nextLine ? `; continue at line ${d.nextLine}` : ""}`)
  let output = ""
  if (category === "SHELL" && ("stdout" in d || "stderr" in d || "exitCode" in d)) {
    output = [text(d.stdout), d.stderr ? `stderr:\n${text(d.stderr)}` : "", error].filter(Boolean).join("\n")
    references.unshift(`exit: ${d.exitCode ?? "unknown"}${d.signal ? ` · signal: ${text(d.signal)}` : ""}${d.timedOut ? " · timed out" : ""}`)
  } else if (status !== "completed") {
    output = error || text(data) || status
  } else if (category === "READ") {
    output = text(d.content ?? (typeof data === "string" ? data : data)) || "Empty file"
    if (d.startLine) references.push(`Lines ${d.startLine}–${d.endLine} of ${d.totalLines ?? "?"}`)
  } else if (category === "WRITE" && envelope.success === true) {
    output = `Written content excerpt:\n${text(a.content).split("\n").map((l) => `+ ${l}`).join("\n")}`
  } else if (category === "EDIT" && envelope.success === true) {
    output = `Replacement excerpt (not a full-file diff):\n${text(a.oldText ?? a.old_string).split("\n").map((l) => `- ${l}`).join("\n")}\n${text(a.newText ?? a.new_string).split("\n").map((l) => `+ ${l}`).join("\n")}`
  } else {
    const items = Array.isArray(data) ? data : d.matches ?? d.results ?? d.files
    if (Array.isArray(items)) {
      output = items.length ? items.map((item) => {
        if (typeof item === "string") return text(item)
        const r = record(item)
        return r.url ? [text(r.title), text(r.url), text(r.snippet ?? r.text ?? r.content)].filter(Boolean).join("\n")
          : r.path || r.file ? `${text(r.path ?? r.file)}${r.line ? `:${r.line}` : ""}${r.content ? `: ${text(r.content)}` : ""}` : text(item)
      }).join("\n") : "No matches"
    } else output = text(d.content ?? d.text ?? data)
  }
  return { status, output: output || "No output", references }
}

export class ToolTranscript {
  readonly calls: ToolInvocation[] = []
  start(name: string, args?: unknown, id?: string, now = Date.now()): ToolInvocation {
    const existing = id ? this.calls.find((c) => c.id === id) : undefined
    if (existing) return existing
    const call: ToolInvocation = {
      id: id ?? `local-${this.calls.length + 1}`, number: this.calls.length + 1,
      name, args, category: toolCategory(name), operation: toolOperation(name, args),
      startedAt: now, status: "running", output: "", references: [],
    }
    this.calls.push(call)
    return call
  }
  finish(name: string, args: unknown, result: unknown, id?: string, now = Date.now()): ToolInvocation {
    const call = (id ? this.calls.find((c) => c.id === id) : this.calls.find((c) => c.status === "running" && c.name === name && key(c.args) === key(args))) ?? this.start(name, args, id, now)
    Object.assign(call, normalizeToolResult(name, call.args, result), { endedAt: now })
    const data = record(record(parse(result)).data)
    if (typeof data.cwd === "string" && call.category === "SHELL") call.operation = toolOperation(name, { ...record(parse(call.args)), cwd: data.cwd })
    return call
  }
  settle(status: "cancelled" | "failed", now = Date.now()): ToolInvocation[] {
    const pending = this.calls.filter((c) => c.status === "running")
    for (const call of pending) Object.assign(call, { status, endedAt: now, output: status === "cancelled" ? "Interrupted" : "No completion result received" })
    return pending
  }
}

export function renderToolBlock(call: ToolInvocation, opts: { width?: number; expanded?: boolean; interactive?: boolean; now?: number; completionOnly?: boolean } = {}): string {
  const width = Math.max(6, opts.width ?? 80)
  const duration = Math.max(0, (call.endedAt ?? opts.now ?? Date.now()) - call.startedAt)
  const header = `${call.number}. ${call.category}${call.category === "TOOL" ? ` · ${call.name}` : ""} · ${call.status} · ${(duration / 1000).toFixed(1)}s`
  const body = call.output ? wrapTerminalText(call.output, width - 4) : []
  const preview = opts.expanded ? body : body.slice(0, 6)
  const hidden = body.length - preview.length
  const lines = [header, ...(opts.completionOnly ? [] : wrapTerminalText(call.operation, width - 4)), ...preview,
    ...(hidden > 0 ? [`… +${hidden} lines${opts.interactive ? " [Ctrl+O details]" : ""}`] : []), ...call.references]
  return lines.flatMap((l, i) => wrapTerminalText(sanitizeTerminalText(l), width - 4).map((part) => `${i === 0 ? "  " : "  │ "}${part}`)).join("\n") + "\n"
}

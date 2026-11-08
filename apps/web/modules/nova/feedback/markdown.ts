import type { NovaFeedbackEvent, NovaFeedbackEventType, NovaFeedbackSeverity } from "@super/nova"

type NovaFeedbackTimelineEntry = {
  type: NovaFeedbackEventType
  ts: number
  offsetMs: number
  sequence: number
  payload: Record<string, unknown>
}

const TYPE_LABELS: Record<NovaFeedbackEventType, string> = {
  turn_started: "Turn started",
  status: "Status",
  status_transition: "Transition",
  text: "Assistant",
  reasoning: "Reasoning",
  tool_call: "Tool call",
  tool_result: "Tool result",
  approval_request: "Approval",
  approval_decision: "Approval decision",
  child_run: "Child run",
  finish: "Finish",
  error: "Error",
}

const TYPE_ORDER: NovaFeedbackEventType[] = [
  "turn_started",
  "status",
  "status_transition",
  "approval_request",
  "approval_decision",
  "reasoning",
  "text",
  "tool_call",
  "tool_result",
  "child_run",
  "finish",
  "error",
]

function safeString(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value
  if (value === null || value === undefined) return fallback
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

function truncate(value: string, max = 240): string {
  if (value.length <= max) return value
  return `${value.slice(0, max)}…`
}

function renderToolCall(entry: NovaFeedbackTimelineEntry): string {
  const toolName = safeString(entry.payload["toolName"], "unknown")
  const args = entry.payload["args"] ?? {}
  return `### Tool call — \`${toolName}\`\n\n\`\`\`json\n${truncate(safeString(args, "{}"), 800)}\n\`\`\`\n`
}

function renderToolResult(entry: NovaFeedbackTimelineEntry): string {
  const toolName = safeString(entry.payload["toolName"], "unknown")
  const status = safeString(entry.payload["status"], "completed")
  const message = safeString(entry.payload["message"], "")
  const content = entry.payload["content"]
  return `### Tool result — \`${toolName}\` (${status})\n\n${message ? `${message}\n\n` : ""}\`\`\`\n${truncate(safeString(content, ""), 1200)}\n\`\`\`\n`
}

function renderStatus(entry: NovaFeedbackTimelineEntry): string {
  const phase = safeString(entry.payload["phase"])
  const message = safeString(entry.payload["message"])
  return phase || message ? `- **${phase || "status"}** — ${message || "(no message)"}\n` : ""
}

function renderReasoning(entry: NovaFeedbackTimelineEntry): string {
  return `> ${truncate(safeString(entry.payload["content"], ""), 600).replace(/\n/g, "\n> ")}\n`
}

function renderText(entry: NovaFeedbackTimelineEntry): string {
  return `${truncate(safeString(entry.payload["content"], ""), 1200)}\n`
}

function renderApprovalRequest(entry: NovaFeedbackTimelineEntry): string {
  const capability = safeString(entry.payload["capability"])
  const summary = safeString(entry.payload["summary"])
  return `- Approval requested: \`${capability}\`${summary ? ` — ${summary}` : ""}\n`
}

function renderApprovalDecision(entry: NovaFeedbackTimelineEntry): string {
  const decision = safeString(entry.payload["decision"])
  return `- Approval ${decision || "resolved"}\n`
}

function renderChildRun(entry: NovaFeedbackTimelineEntry): string {
  const agent = safeString(entry.payload["agent"], "explore")
  const task = safeString(entry.payload["task"])
  return `- Child run (\`${agent}\`): ${truncate(task, 240)}\n`
}

function renderTransition(entry: NovaFeedbackTimelineEntry): string {
  const from = safeString(entry.payload["from"], "?")
  const to = safeString(entry.payload["to"], "?")
  return `- ${from} → ${to}\n`
}

function renderError(entry: NovaFeedbackTimelineEntry): string {
  return `> ⚠️ ${truncate(safeString(entry.payload["message"], ""), 600)}\n`
}

function renderFinish(entry: NovaFeedbackTimelineEntry): string {
  const reason = safeString(entry.payload["reason"])
  return `- **finish** — ${reason}\n`
}

function renderEntry(entry: NovaFeedbackTimelineEntry): string {
  const header = `#### t+${entry.offsetMs}ms · ${TYPE_LABELS[entry.type] ?? entry.type}\n`
  switch (entry.type) {
    case "tool_call":
      return `${header}${renderToolCall(entry)}`
    case "tool_result":
      return `${header}${renderToolResult(entry)}`
    case "status":
      return renderStatus(entry)
    case "text":
      return `${header}${renderText(entry)}`
    case "reasoning":
      return `${renderReasoning(entry)}`
    case "approval_request":
      return `${header}${renderApprovalRequest(entry)}`
    case "approval_decision":
      return `${header}${renderApprovalDecision(entry)}`
    case "child_run":
      return `${header}${renderChildRun(entry)}`
    case "status_transition":
      return renderTransition(entry)
    case "error":
      return `${header}${renderError(entry)}`
    case "finish":
      return `${header}${renderFinish(entry)}`
    case "turn_started":
      return `- Turn started at offset ${entry.offsetMs}ms\n`
    default:
      return `${header}\`\`\`json\n${truncate(safeString(entry.payload), 600)}\n\`\`\`\n`
  }
}

function formatSeverity(value: NovaFeedbackSeverity | string): string {
  if (value === "error") return "🚨 error"
  if (value === "warn") return "⚠️ warn"
  return "info"
}

export type RenderTimelineInput = {
  title: string
  exchange: {
    agentSessionId: string | null
    runId: string | null
    surface?: string | null
    provider?: string | null
    model?: string | null
    mode?: string | null
    startedAt: string | null
  }
  summary: string
  severity: NovaFeedbackSeverity | string
  events: NovaFeedbackEvent[]
  improvements: { title: string; detail: string }[]
  perceivedIssues: { kind: string; detail: string }[]
  userRating?: number | null
  userComment?: string | null
  feedbackId: string
}

export function renderNovaFeedbackMarkdown(input: RenderTimelineInput): string {
  const startedAtMs = input.events[0]?.ts ?? Date.now()
  const timeline: NovaFeedbackTimelineEntry[] = input.events
    .map((event) => ({
      type: event.type,
      ts: event.ts,
      offsetMs: event.ts - startedAtMs,
      sequence: event.sequence,
      payload: event.payload,
    }))
    .sort((a, b) => (a.sequence - b.sequence) || (a.offsetMs - b.offsetMs))
  let cursor = -1
  let output = `# Nova turn — ${input.title}\n\n`
  output += `- Feedback id: \`${input.feedbackId}\`\n`
  output += `- Session: ${input.exchange.agentSessionId ?? "n/a"}  ·  Run: ${input.exchange.runId ?? "n/a"}\n`
  if (input.exchange.surface) output += `- Surface: ${input.exchange.surface}\n`
  if (input.exchange.provider) {
    output += `- Provider: ${input.exchange.provider}${input.exchange.model ? ` · ${input.exchange.model}` : ""}\n`
  }
  if (input.exchange.mode) output += `- Mode: ${input.exchange.mode}\n`
  output += `- Severity: ${formatSeverity(input.severity)}  ·  Promoted: false\n`
  if (input.userRating !== undefined && input.userRating !== null) {
    output += `- User rating: ${input.userRating}\n`
  }
  if (input.userComment) output += `- User comment: ${input.userComment}\n`
  output += "\n"

  const grouped = new Map<NovaFeedbackEventType, NovaFeedbackTimelineEntry[]>()
  for (const entry of timeline) {
    const list = grouped.get(entry.type) ?? []
    list.push(entry)
    grouped.set(entry.type, list)
  }

  let totalLatency = 0
  let toolSuccess = 0
  let toolFailed = 0
  let toolDenied = 0
  for (const entry of timeline) {
    if (entry.type === "tool_result") {
      const status = entry.payload["status"]
      if (status === "completed") toolSuccess++
      else if (status === "failed") toolFailed++
      else if (status === "denied") toolDenied++
    }
  }

  output += "## Summary\n\n"
  output += `${input.summary}\n\n`

  if (input.perceivedIssues.length > 0) {
    output += "## Perceived issues\n\n"
    for (const issue of input.perceivedIssues) {
      output += `- **${issue.kind}** — ${issue.detail}\n`
    }
    output += "\n"
  }

  if (input.improvements.length > 0) {
    output += "## Suggested improvements\n\n"
    for (const improvement of input.improvements) {
      output += `1. **${improvement.title}** — ${improvement.detail}\n`
    }
    output += "\n"
  }

  const toolResults = grouped.get("tool_result") ?? []
  const toolCalls = grouped.get("tool_call") ?? []
  if (toolCalls.length > 0) {
    output += `## Tools invoked (${toolCalls.length} called, ${toolResults.length} results; success=${toolSuccess}, failed=${toolFailed}, denied=${toolDenied})\n\n`
    output += "| # | tool | status | latency | preview |\n"
    output += "|---|------|--------|---------|---------|\n"
    for (let i = 0; i < toolCalls.length; i++) {
      const call = toolCalls[i]!
      const result = toolResults[i]
      const toolName = safeString(call.payload["toolName"], "unknown")
      const status = result ? safeString(result.payload["status"], "—") : "—"
      const latencyMs = result ? Math.max(0, result.ts - call.ts) : 0
      totalLatency += latencyMs
      const preview = truncate(safeString(result?.payload["message"] ?? call.payload["args"]), 80)
      output += `| ${i + 1} | \`${toolName}\` | ${status} | ${latencyMs}ms | ${preview.replace(/\|/g, "\\|")} |\n`
    }
    output += "\n"
  }

  const children = grouped.get("child_run") ?? []
  if (children.length > 0) {
    output += "## Agents invoked (children)\n\n"
    for (const child of children) {
      const agent = safeString(child.payload["agent"], "explore")
      const task = truncate(safeString(child.payload["task"]), 200)
      output += `- \`${agent}\` — ${task}\n`
    }
    output += "\n"
  }

  const transitions = (grouped.get("status_transition") ?? []).map((entry) => {
    const from = safeString(entry.payload["from"], "?")
    const to = safeString(entry.payload["to"], "?")
    return `${from} → ${to}`
  })
  if (transitions.length > 0) {
    output += "## Status transitions\n\n"
    output += `${transitions.join(" → ")}\n\n`
  }

  output += "## Timeline\n\n"
  for (const entry of timeline) {
    const orderedIndex = TYPE_ORDER.indexOf(entry.type)
    if (orderedIndex > cursor) {
      if (entry.type === "turn_started") {
        output += renderEntry(entry)
      }
      cursor = orderedIndex
    }
    output += renderEntry(entry)
  }

  output += "\n---\n"
  output += `events=${timeline.length}  total_tool_latency=${totalLatency}ms  generated by /api/nova/feedback · ${input.feedbackId}\n`

  return output
}

export function buildDefaultImprovements(
  issues: { kind: string; detail: string }[],
): { title: string; detail: string }[] {
  if (issues.length === 0) return []
  const improvements: { title: string; detail: string }[] = []
  for (const issue of issues) {
    switch (issue.kind) {
      case "empty_tool_result":
        improvements.push({
          title: "Detect empty tool results and prompt for retry guidance",
          detail: `Tool returned an empty payload: ${issue.detail}. Consider aborting or surfacing the empty result earlier.`,
        })
        break
      case "tool_failure":
        improvements.push({
          title: "Surface tool failure diagnostics in the assistant response",
          detail: `Tool failed: ${issue.detail}. Reply should explicitly call out the failure before continuing.`,
        })
        break
      case "tool_denied":
        improvements.push({
          title: "Pre-declare risky tool calls so denials are visible to the user",
          detail: `Tool was denied by the harness: ${issue.detail}.`,
        })
        break
      case "repeated_call":
        improvements.push({
          title: "Avoid repeated identical tool calls without varying arguments",
          detail: `Identical retry blocked: ${issue.detail}. Inspect arguments before each invocation.`,
        })
        break
      case "long_tail_latency":
        improvements.push({
          title: "Cap per-tool latency and degrade gracefully above the budget",
          detail: `Long tail: ${issue.detail}.`,
        })
        break
      case "near_budget_limit":
        improvements.push({
          title: "Shrink the working set when approaching the context budget",
          detail: `Near budget: ${issue.detail}.`,
        })
        break
      case "transition_invalid":
        improvements.push({
          title: "Stabilize transitions across run states",
          detail: `Transition rejected: ${issue.detail}.`,
        })
        break
      default:
        improvements.push({
          title: `Investigate ${issue.kind}`,
          detail: issue.detail,
        })
    }
    if (improvements.length >= 6) break
  }
  return improvements
}

export function deriveSeverityFromOutcome(
  outcome: "completed" | "failed" | "cancelled",
  issues: { kind: string; detail?: string }[],
): NovaFeedbackSeverity {
  if (outcome === "failed") return "error"
  if (outcome === "cancelled") return "warn"
  if (issues.some((issue) => ["tool_failure", "near_budget_limit"].includes(issue.kind))) return "warn"
  return "info"
}

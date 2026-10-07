import type {
  AgentSessionSummary,
  ApprovalRequest,
  ConnectorStatus,
  SessionDetail,
  SyncCursor,
  TimelineActivity,
  TimelineMessage,
} from "@/modules/nova-web/types"
import type { NovaReference } from "@/modules/nova/references/contracts"

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(
      typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Request failed",
    )
  }
  return payload as T
}

export function listSessions() {
  return requestJson<{ sessions: AgentSessionSummary[] }>("/api/nova/sessions")
}

export function createSession(objective: string) {
  return requestJson<{ session: AgentSessionSummary }>("/api/nova/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objective, mode: "chat", surface: "web" }),
  })
}

export function getSession(sessionId: string) {
  return requestJson<{ session: SessionDetail }>(`/api/nova/sessions/${sessionId}`)
}

export function syncSession(sessionId: string, after: number, limit = 200) {
  return requestJson<SyncCursor>(
    `/api/nova/sessions/${sessionId}/sync?after=${Math.max(0, after)}&limit=${limit}`,
  )
}

export function listApprovals() {
  return requestJson<{ approvals: ApprovalRequest[] } | { contractVersion: string; approvals: ApprovalRequest[] }>(
    "/api/nova/approvals",
  )
}

export function listConnectors() {
  return requestJson<{ connectors: ConnectorStatus[] }>("/api/nova/connectors")
}

export function decideApproval(approval: ApprovalRequest, decision: "approved" | "denied") {
  return requestJson(`/api/nova/approvals/${approval.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision,
      sessionId: approval.sessionId,
      runId: approval.runId,
      toolInvocationId: approval.toolInvocationId,
      capability: approval.capability,
      normalizedArgsHash: approval.normalizedArgsHash,
    }),
  })
}

export type TurnEvent =
  | { type: "status"; phase: string; message: string; runId?: string; model?: string }
  | {
      type: "user_message"
      message: Omit<TimelineMessage, "kind">
      runId: string
      latestSequence: number
    }
  | { type: "text"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "activity"; activity: Omit<TimelineActivity, "kind"> }
  | { type: "error"; message: string }
  | { type: "finish"; reason: string; runId?: string; latestSequence?: number; model?: string }

export async function* streamTurn(
  sessionId: string,
  content: string,
  options?: {
    clientMessageId?: string
    model?: string
    provider?: string
    effort?: "low" | "medium" | "high" | "xhigh"
    mode?: "agent" | "plan" | "chat"
    references?: NovaReference[]
  },
): AsyncGenerator<TurnEvent> {
  const response = await fetch(`/api/nova/sessions/${sessionId}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content,
      clientMessageId: options?.clientMessageId,
      model: options?.model,
      provider: options?.provider,
      effort: options?.effort,
      mode: options?.mode,
      references: options?.references?.map(({ kind, id }) => ({ kind, id })),
    }),
  })
  if (!response.ok || !response.body) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(
      typeof payload === "object" && payload && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Turn failed",
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      yield JSON.parse(trimmed) as TurnEvent
    }
  }

  const tail = buffer.trim()
  if (tail) yield JSON.parse(tail) as TurnEvent
}

import type {
  AgentSessionSummary,
  ApprovalRequest,
  ConnectorStatus,
  SyncCursor as ContractSyncCursor,
} from "@super/nova"
import type { NovaReference } from "@/modules/nova/references/contracts"

export type SyncCursor = Omit<ContractSyncCursor, "messages"> & {
  messages: Array<ContractSyncCursor["messages"][number] & { references?: NovaReference[] }>
}

export type SessionDetail = AgentSessionSummary & {
  runs: Array<{
    id: string
    status: string
    executionTarget: string
    desktopDeviceId: string | null
    createdAt: string
    updatedAt: string
  }>
}

export type TimelineMessage = SyncCursor["messages"][number] & { kind: "message" }
export type TimelineActivity = SyncCursor["activities"][number] & { kind: "activity" }
export type TimelineEntry = TimelineMessage | TimelineActivity

export type NovaUser = {
  id: string
  name: string
  email: string
  image?: string | null
}

export type WorkspaceView =
  | "home"
  | "session"
  | "approvals"
  | "connections"
  | "pulls"
  | "pull"
  | "more"
  | "settings"

export type { AgentSessionSummary, ApprovalRequest, ConnectorStatus }

export const statusStyles: Record<string, string> = {
  active: "bg-emerald-400",
  completed: "bg-sky-400",
  sleeping: "bg-amber-400",
  failed: "bg-red-400",
  cancelled: "bg-zinc-500",
  awaiting_approval: "bg-orange-400",
  running: "bg-emerald-400",
  working: "bg-emerald-400",
  queued: "bg-zinc-500",
  planning: "bg-sky-400",
  gathering_context: "bg-sky-400",
  executing: "bg-emerald-400",
  delivering: "bg-sky-400",
}

export function relativeTime(value: string) {
  const difference = Date.now() - new Date(value).getTime()
  const minutes = Math.max(1, Math.floor(difference / 60_000))
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

export function sessionUiStatus(session: Pick<AgentSessionSummary, "status" | "activeRunId">) {
  if (session.activeRunId) return "working"
  if (session.status === "active") return "idle"
  return session.status
}

export function sessionUiLabel(status: string) {
  switch (status) {
    case "working":
      return "Working"
    case "awaiting_approval":
      return "Needs you"
    case "sleeping":
      return "Waiting"
    case "failed":
      return "Failed"
    case "cancelled":
      return "Cancelled"
    case "completed":
      return "Done"
    case "idle":
      return "Idle"
    default:
      return status.replaceAll("_", " ")
  }
}

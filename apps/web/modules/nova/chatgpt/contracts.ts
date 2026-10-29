export const CHATGPT_PROVIDER = "chatgpt"
export const CHATGPT_HOSTED_STATUS = "awaiting_hosted_approval" as const
export const CHATGPT_UNAVAILABLE_MESSAGE = "Hosted ChatGPT plan inference is not enabled. Use Local Codex in locally hosted Nova Settings → Models, or configure an approved hosted Sign in with ChatGPT integration."

export type ChatGPTConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "permission_not_granted"
  | "reconnect_required"
  | "usage_limited"
  | "service_unavailable"

/** Only this credential-free projection may cross the server/client boundary. */
export type ChatGPTConnectionView = {
  id: string
  label: string
  status: ChatGPTConnectionStatus
  selected: boolean
}

export type ChatGPTConnectionRecord = {
  id: string
  userId: string
  organizationId: string
  issuer: string
  subject: string
  clientId: string
  label: string
  status: ChatGPTConnectionStatus
  scopes: string[]
  credentialRef: string | null
  expiresAt: number
  version: number
}

export function connectionView(record: ChatGPTConnectionRecord, selectedId: string | null): ChatGPTConnectionView {
  return { id: record.id, label: record.label, status: record.status, selected: record.id === selectedId }
}

export function assertConnectionOwner(record: ChatGPTConnectionRecord, owner: { userId: string; organizationId: string }): void {
  if (record.userId !== owner.userId || record.organizationId !== owner.organizationId) {
    throw new Error("ChatGPT connection not found")
  }
}

export function hasPlanPermission(scopes: readonly string[]): boolean {
  return scopes.includes("resource.invoke") && scopes.includes("chatgpt.tokens.use.direct")
}

/** Intentionally not environment-toggleable until the hosted contract is implemented and reviewed. */
export function assertChatGPTHostedAvailable(): never {
  throw new Error(CHATGPT_UNAVAILABLE_MESSAGE)
}

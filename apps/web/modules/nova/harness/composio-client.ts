import { terminalHarnessUrl } from "./client"

export type ComposioTool = {
  name: string
  displayName: string
  description: string
  parameters: Record<string, unknown>
  toolkit: string
  requiresApproval: boolean
}

type ComposioAction = "apps" | "session" | "tools" | "connect" | "disconnect" | "execute"

export async function requestHarnessComposio<T>(
  action: ComposioAction,
  token: string,
  body: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const timeout = AbortSignal.timeout(120_000)
  const response = await fetch(`${terminalHarnessUrl()}/api/composio/${action}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Supercode-Client": "nova-web",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok || !payload) {
    const message = payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
      ? payload.error
      : "The CLI server returned an invalid Composio response"
    throw Object.assign(new Error(message), { statusCode: response.ok ? 502 : response.status })
  }
  return payload as T
}

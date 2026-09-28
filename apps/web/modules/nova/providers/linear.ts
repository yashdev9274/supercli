import { NOVA_CONTRACT_VERSION, type NormalizedInboundEvent } from "@super/nova"
import { getCredential } from "@super/secrets"

import { connectorCallbackUrl } from "@/modules/nova/connectors/config"

export type LinearCredential = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

type LinearTokenResponse = {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string | string[]
  error?: string
  error_description?: string
}

type LinearViewerResponse = {
  data?: {
    viewer?: {
      id?: string
      name?: string
      organization?: { id?: string; name?: string }
    }
  }
  errors?: Array<{ message?: string }>
}

type LinearWebhookEnvelope = {
  type?: string
  action?: string
  createdAt?: string
  organizationId?: string
  appUserId?: string
  actor?: { id?: string; type?: string }
  agentSession?: {
    id?: string
    issue?: { id?: string; identifier?: string }
    comment?: { id?: string }
  }
  agentActivity?: { id?: string; body?: string; content?: { body?: string } }
  promptContext?: string
  data?: { id?: string; issueId?: string; body?: string }
}

async function linearGraphql<T>(accessToken: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  })
  const result = await response.json() as T & { errors?: Array<{ message?: string }> }
  if (!response.ok || result.errors?.length) {
    throw new Error(`Linear API failed: ${result.errors?.[0]?.message ?? response.status}`)
  }
  return result
}

export async function exchangeLinearCode(code: string): Promise<{
  externalAccountId: string
  externalAccountName: string | null
  botExternalUserId: string | null
  scopes: string[]
  credential: LinearCredential
}> {
  const clientId = process.env.NOVA_LINEAR_CLIENT_ID
  const clientSecret = process.env.NOVA_LINEAR_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("Nova Linear OAuth is not configured")

  const response = await fetch("https://api.linear.app/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      redirect_uri: connectorCallbackUrl("linear"),
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  })
  const token = await response.json() as LinearTokenResponse
  if (!response.ok || !token.access_token) {
    throw new Error(`Linear OAuth failed: ${token.error_description ?? token.error ?? response.status}`)
  }
  const viewer = await linearGraphql<LinearViewerResponse>(
    token.access_token,
    "query NovaLinearViewer { viewer { id name organization { id name } } }",
  )
  const accountId = viewer.data?.viewer?.organization?.id
  if (!accountId) throw new Error("Linear OAuth response did not resolve a workspace")
  const scopes = Array.isArray(token.scope)
    ? token.scope
    : token.scope?.split(/[ ,]+/).filter(Boolean) ?? []

  return {
    externalAccountId: accountId,
    externalAccountName: viewer.data?.viewer?.organization?.name ?? null,
    botExternalUserId: viewer.data?.viewer?.id ?? null,
    scopes,
    credential: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    },
  }
}

export function parseLinearEnvelope(input: unknown): LinearWebhookEnvelope | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as LinearWebhookEnvelope
    : null
}

export function normalizeLinearEvent(input: {
  envelope: LinearWebhookEnvelope
  deliveryId: string
  organizationId: string
  installationId: string
  botExternalUserId: string | null
}): NormalizedInboundEvent | null {
  const { envelope } = input
  if (envelope.type !== "AgentSessionEvent") return null
  if (envelope.action !== "created" && envelope.action !== "prompted") return null
  const agentSessionId = envelope.agentSession?.id
  if (!agentSessionId) return null
  const actorId = envelope.actor?.id ?? null
  if (actorId && input.botExternalUserId && actorId === input.botExternalUserId) return null
  const text = envelope.action === "prompted"
    ? envelope.agentActivity?.body ?? envelope.agentActivity?.content?.body
    : envelope.promptContext
  if (!text?.trim()) return null
  const issueId = envelope.agentSession?.issue?.id ?? envelope.data?.issueId ?? null

  return {
    contractVersion: NOVA_CONTRACT_VERSION,
    organizationId: input.organizationId,
    installationId: input.installationId,
    provider: "linear",
    providerDeliveryId: input.deliveryId,
    eventType: envelope.action === "created" ? "agent_session_created" : "agent_session_prompted",
    actorExternalId: actorId,
    surface: {
      externalSurfaceId: agentSessionId,
      externalContainerId: issueId,
    },
    occurredAt: new Date(envelope.createdAt ?? Date.now()).toISOString(),
    payload: {
      text: text.trim(),
      externalId: envelope.agentActivity?.id ?? agentSessionId,
      agentSessionId,
      issueId,
    },
  }
}

export async function postLinearReply(input: {
  credentialRef: string
  agentSessionId: string
  text: string
  type?: "thought" | "elicitation" | "response" | "error"
}): Promise<string> {
  const credential = await getCredential<LinearCredential>(input.credentialRef)
  if (!credential.accessToken) throw new Error("Linear credential is missing an access token")
  const result = await linearGraphql<{
    data?: { agentActivityCreate?: { success?: boolean; agentActivity?: { id?: string } } }
  }>(
    credential.accessToken,
    `mutation NovaAgentActivity($input: AgentActivityCreateInput!) {
      agentActivityCreate(input: $input) {
        success
        agentActivity { id }
      }
    }`,
    {
      input: {
        agentSessionId: input.agentSessionId,
        content: { type: input.type ?? "response", body: input.text },
      },
    },
  )
  const activity = result.data?.agentActivityCreate
  if (!activity?.success || !activity.agentActivity?.id) {
    throw new Error("Linear did not create the Nova agent activity")
  }
  return activity.agentActivity.id
}

import { NOVA_CONTRACT_VERSION, type NormalizedInboundEvent } from "@super/nova"

import { connectorCallbackUrl } from "@/modules/nova/connectors/config"

export type SlackCredential = {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

type SlackOAuthResponse = {
  ok?: boolean
  error?: string
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  bot_user_id?: string
  team?: { id?: string; name?: string }
  enterprise?: { id?: string; name?: string } | null
  is_enterprise_install?: boolean
}

type SlackEventEnvelope = {
  type?: string
  challenge?: string
  team_id?: string
  enterprise_id?: string
  event_id?: string
  event_time?: number
  event?: {
    type?: string
    subtype?: string
    user?: string
    bot_id?: string
    text?: string
    ts?: string
    event_ts?: string
    thread_ts?: string
    channel?: string
    channel_type?: string
  }
}

export async function exchangeSlackCode(code: string): Promise<{
  externalAccountId: string
  externalAccountName: string | null
  botExternalUserId: string | null
  scopes: string[]
  credential: SlackCredential
}> {
  const clientId = process.env.NOVA_SLACK_CLIENT_ID
  const clientSecret = process.env.NOVA_SLACK_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("Nova Slack OAuth is not configured")

  const body = new URLSearchParams({
    code,
    redirect_uri: connectorCallbackUrl("slack"),
  })
  const response = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  })
  const result = await response.json() as SlackOAuthResponse
  if (!response.ok || !result.ok || !result.access_token) {
    throw new Error(`Slack OAuth failed: ${result.error ?? response.status}`)
  }
  const accountId = result.is_enterprise_install
    ? result.enterprise?.id
    : result.team?.id
  if (!accountId) throw new Error("Slack OAuth response did not include a workspace ID")

  return {
    externalAccountId: accountId,
    externalAccountName: result.is_enterprise_install
      ? result.enterprise?.name ?? null
      : result.team?.name ?? null,
    botExternalUserId: result.bot_user_id ?? null,
    scopes: result.scope?.split(",").map((scope) => scope.trim()).filter(Boolean) ?? [],
    credential: {
      accessToken: result.access_token,
      refreshToken: result.refresh_token,
      expiresAt: result.expires_in ? Date.now() + result.expires_in * 1000 : undefined,
    },
  }
}

export function parseSlackEnvelope(input: unknown): SlackEventEnvelope | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input as SlackEventEnvelope
    : null
}

export function normalizeSlackEvent(input: {
  envelope: SlackEventEnvelope
  organizationId: string
  installationId: string
  botExternalUserId: string | null
}): NormalizedInboundEvent | null {
  const { envelope, botExternalUserId } = input
  const event = envelope.event
  if (envelope.type !== "event_callback" || !event || !envelope.event_id) return null
  const isDirectMessage = event.type === "message" && event.channel_type === "im"
  const isMention = event.type === "app_mention"
  if ((!isDirectMessage && !isMention) || event.subtype || event.bot_id) return null
  if (!event.user || !event.channel || !event.ts || !event.text) return null
  if (botExternalUserId && event.user === botExternalUserId) return null

  const rootTimestamp = event.thread_ts ?? event.ts
  return {
    contractVersion: NOVA_CONTRACT_VERSION,
    organizationId: input.organizationId,
    installationId: input.installationId,
    provider: "slack",
    providerDeliveryId: envelope.event_id,
    eventType: isMention ? "mention" : "direct_message",
    actorExternalId: event.user,
    surface: {
      externalSurfaceId: `${event.channel}:${rootTimestamp}`,
      externalContainerId: event.channel,
    },
    occurredAt: new Date((envelope.event_time ?? Number(event.event_ts?.split(".")[0] ?? 0)) * 1000).toISOString(),
    payload: {
      text: event.text,
      externalId: event.ts,
      channelId: event.channel,
      threadTimestamp: rootTimestamp,
    },
  }
}

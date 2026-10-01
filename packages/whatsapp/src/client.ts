import { WhatsAppClient } from "@kapso/whatsapp-cloud-api"
import { getWhatsAppConfig, type WhatsAppConfig } from "./config"
import { encodeActionPayload } from "./payloads"

let cachedClient: WhatsAppClient | null = null

export function getWhatsAppClient(config: WhatsAppConfig = getWhatsAppConfig()) {
  if (!cachedClient) {
    cachedClient = new WhatsAppClient({
      baseUrl: config.baseUrl,
      kapsoApiKey: config.apiKey,
    })
  }
  return cachedClient
}

export async function sendLinkCode(params: {
  to: string
  code: string
  config?: WhatsAppConfig
}) {
  const config = params.config ?? getWhatsAppConfig()
  return getWhatsAppClient(config).messages.sendTemplate({
    phoneNumberId: config.phoneNumberId,
    to: params.to.replace(/^\+/, ""),
    template: {
      name: config.linkTemplateName,
      language: { code: config.templateLanguage },
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: params.code }],
        },
      ],
    },
  })
}

export async function sendReviewComplete(params: {
  to?: string | null
  recipient?: string | null
  reviewId: string
  repository: string
  prNumber: number
  prTitle: string
  summary: string
  prUrl: string
  includeActions?: boolean
  config?: WhatsAppConfig
}) {
  const config = params.config ?? getWhatsAppConfig()
  // Template components use a loose schema; the `type` key must be
  // statically known to satisfy the sender input type.
  const components: Array<{ type: string } & Record<string, unknown>> = [
    {
      type: "body",
      parameters: [
        { type: "text", parameter_name: "repository", text: params.repository },
        { type: "text", parameter_name: "pr_number", text: String(params.prNumber) },
        { type: "text", parameter_name: "pr_title", text: params.prTitle.slice(0, 120) },
        { type: "text", parameter_name: "summary", text: params.summary.slice(0, 500) },
        { type: "text", parameter_name: "pr_url", text: params.prUrl },
      ],
    },
  ]

  if (params.includeActions) {
    components.push(
      {
        type: "button",
        sub_type: "quick_reply",
        index: "0",
        parameters: [
          { type: "payload", payload: encodeActionPayload("approve", params.reviewId) },
        ],
      },
      {
        type: "button",
        sub_type: "quick_reply",
        index: "1",
        parameters: [
          {
            type: "payload",
            payload: encodeActionPayload("request_changes", params.reviewId),
          },
        ],
      },
    )
  }

  return getWhatsAppClient(config).messages.sendTemplate({
    phoneNumberId: config.phoneNumberId,
    // RecipientAddress requires `to` or `recipient`.
    ...(params.to
      ? { to: params.to.replace(/^\+/, "") }
      : { recipient: params.recipient as string }),
    template: {
      name: config.reviewTemplateName,
      language: { code: config.templateLanguage },
      components,
    },
  })
}

export async function sendWhatsAppText(params: {
  to?: string | null
  recipient?: string | null
  body: string
  config?: WhatsAppConfig
}) {
  const config = params.config ?? getWhatsAppConfig()
  return getWhatsAppClient(config).messages.sendText({
    phoneNumberId: config.phoneNumberId,
    ...(params.to
      ? { to: params.to.replace(/^\+/, "") }
      : { recipient: params.recipient as string }),
    body: params.body,
  })
}

export function getMessageId(result: unknown): string | null {
  if (!result || typeof result !== "object") return null
  const messages = (result as { messages?: Array<{ id?: string }> }).messages
  return messages?.[0]?.id ?? null
}

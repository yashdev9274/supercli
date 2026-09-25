import { z } from "zod"

const messageSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  from: z.string().optional(),
  to: z.string().optional(),
  from_user_id: z.string().optional(),
  from_parent_user_id: z.string().optional(),
  username: z.string().optional(),
  text: z.object({ body: z.string() }).optional(),
  interactive: z
    .object({
      type: z.string().optional(),
      button_reply: z
        .object({ id: z.string(), title: z.string().optional() })
        .optional(),
      list_reply: z
        .object({ id: z.string(), title: z.string().optional() })
        .optional(),
    })
    .optional(),
  button: z.object({ payload: z.string().optional(), text: z.string().optional() }).optional(),
  kapso: z
    .object({
      status: z.string().optional(),
      direction: z.string().optional(),
      content: z.string().optional(),
      statuses: z.array(z.record(z.string(), z.unknown())).optional(),
    })
    .passthrough()
    .optional(),
}).passthrough()

const conversationSchema = z.object({
  id: z.string().optional(),
  phone_number: z.string().optional(),
  business_scoped_user_id: z.string().optional(),
  parent_business_scoped_user_id: z.string().optional(),
  username: z.string().optional(),
  phone_number_id: z.string().optional(),
}).passthrough()

const payloadSchema = z.object({
  message: messageSchema.optional(),
  conversation: conversationSchema.optional(),
  phone_number_id: z.string().min(1),
}).passthrough()

const batchSchema = z.object({
  batch: z.literal(true),
  data: z.array(payloadSchema).min(1).max(100),
}).passthrough()

export type KapsoWebhookPayload = z.infer<typeof payloadSchema>

export function parseKapsoWebhookBody(input: unknown): KapsoWebhookPayload[] {
  const batch = batchSchema.safeParse(input)
  if (batch.success) return batch.data.data
  return [payloadSchema.parse(input)]
}

export function getInboundActionPayload(payload: KapsoWebhookPayload): string | null {
  return (
    payload.message?.interactive?.button_reply?.id ??
    payload.message?.interactive?.list_reply?.id ??
    payload.message?.button?.payload ??
    null
  )
}

export function getExternalContact(payload: KapsoWebhookPayload) {
  const message = payload.message
  const conversation = payload.conversation
  return {
    phoneE164: conversation?.phone_number
      ? `+${conversation.phone_number.replace(/^\+/, "")}`
      : message?.from
        ? `+${message.from.replace(/^\+/, "")}`
        : null,
    conversationId: conversation?.id ?? null,
    businessScopedUserId:
      conversation?.business_scoped_user_id ?? message?.from_user_id ?? null,
    parentBusinessScopedUserId:
      conversation?.parent_business_scoped_user_id ??
      message?.from_parent_user_id ??
      null,
    username: conversation?.username ?? message?.username ?? null,
  }
}

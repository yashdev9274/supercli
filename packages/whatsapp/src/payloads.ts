import { z } from "zod"

export const whatsAppActionSchema = z.enum([
  "approve",
  "request_changes",
  "open_pr",
])

export type WhatsAppActionName = z.infer<typeof whatsAppActionSchema>

const actionPayloadSchema = z.object({
  version: z.literal("v1"),
  action: whatsAppActionSchema,
  reviewId: z.string().min(1).max(128),
})

export function encodeActionPayload(
  action: WhatsAppActionName,
  reviewId: string,
): string {
  return ["sc", "v1", action, reviewId].join(":")
}

export function decodeActionPayload(payload: string): {
  action: WhatsAppActionName
  reviewId: string
} | null {
  const [prefix, version, action, reviewId, extra] = payload.split(":")
  if (prefix !== "sc" || extra !== undefined) return null
  const parsed = actionPayloadSchema.safeParse({ version, action, reviewId })
  return parsed.success
    ? { action: parsed.data.action, reviewId: parsed.data.reviewId }
    : null
}

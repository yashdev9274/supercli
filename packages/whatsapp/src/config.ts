import { z } from "zod"

const configSchema = z.object({
  apiKey: z.string().min(1),
  phoneNumberId: z.string().min(1),
  webhookSecret: z.string().min(16),
  reviewTemplateName: z.string().min(1),
  linkTemplateName: z.string().min(1),
  templateLanguage: z.string().min(2).default("en_US"),
  baseUrl: z.string().url().default("https://api.kapso.ai/meta/whatsapp"),
})

export type WhatsAppConfig = z.infer<typeof configSchema>

export function isWhatsAppConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(
    env.KAPSO_API_KEY &&
      env.KAPSO_PHONE_NUMBER_ID &&
      env.KAPSO_WEBHOOK_SECRET &&
      env.KAPSO_REVIEW_TEMPLATE_NAME &&
      env.KAPSO_LINK_TEMPLATE_NAME,
  )
}

export function getWhatsAppConfig(env: NodeJS.ProcessEnv = process.env): WhatsAppConfig {
  return configSchema.parse({
    apiKey: env.KAPSO_API_KEY,
    phoneNumberId: env.KAPSO_PHONE_NUMBER_ID,
    webhookSecret: env.KAPSO_WEBHOOK_SECRET,
    reviewTemplateName: env.KAPSO_REVIEW_TEMPLATE_NAME,
    linkTemplateName: env.KAPSO_LINK_TEMPLATE_NAME,
    templateLanguage: env.KAPSO_TEMPLATE_LANGUAGE,
    baseUrl: env.KAPSO_BASE_URL,
  })
}

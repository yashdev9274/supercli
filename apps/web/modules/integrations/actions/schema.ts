import { z } from "zod"

export const integrationProviderSchema = z.enum(["slack", "linear"])

export type IntegrationProvider = z.infer<typeof integrationProviderSchema>

export const integrationStatusSchema = z.object({
  provider: integrationProviderSchema,
  connected: z.boolean(),
  isActive: z.boolean().optional(),
  teamName: z.string().nullable().optional(),
  teamId: z.string().nullable().optional(),
  channelId: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
})

export type IntegrationStatus = z.infer<typeof integrationStatusSchema>

export const updateSlackConfigSchema = z.object({
  channelId: z.string().min(1).optional().nullable(),
})

export const updateLinearConfigSchema = z.object({
  teamId: z.string().min(1).optional().nullable(),
  teamName: z.string().min(1).optional().nullable(),
})

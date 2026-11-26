import { z } from "zod"

export const agentUsageWindowSchema = z.object({
  label: z.string(),
  remainingPercent: z.number().min(0).max(100),
  resetsAt: z.string().datetime().nullable(),
})

export const agentUsageSchema = z.object({
  provider: z.string(),
  label: z.string(),
  plan: z.string().nullable(),
  status: z.enum(["available", "unavailable"]),
  message: z.string().optional(),
  windows: z.array(agentUsageWindowSchema),
})

export const agentUsageSnapshotSchema = z.object({
  updatedAt: z.string().datetime(),
  agents: z.array(agentUsageSchema),
})

export type AgentUsageWindow = z.infer<typeof agentUsageWindowSchema>
export type AgentUsage = z.infer<typeof agentUsageSchema>
export type AgentUsageSnapshot = z.infer<typeof agentUsageSnapshotSchema>

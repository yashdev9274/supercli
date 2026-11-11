import { z } from "zod"

export const agentInputSchema = z.object({
  name: z.string().trim().min(1, "Agent name is required").max(120),
  description: z.string().trim().max(500).optional().default(""),
  instructions: z.string().trim().min(1, "Agent instructions are required").max(20_000),
  provider: z.string().trim().max(80).optional().default(""),
  model: z.string().trim().max(160).optional().default(""),
  avatarType: z.string().trim().max(32).optional().default("clover"),
  avatarColor: z.string().trim().max(32).optional().default("#3b93ed"),
  effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional().default("high"),
})

export const agentUpdateSchema = agentInputSchema.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
})

export type AgentInput = z.infer<typeof agentInputSchema>
export type AgentUpdate = z.infer<typeof agentUpdateSchema>

export type AgentDto = AgentInput & {
  id: string
  ownerUserId: string
  status: string
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

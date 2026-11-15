import { z } from "zod"

export const subagentEventSchema = z.object({
  type: z.literal("subagent"),
  childId: z.string().min(1).max(100),
  index: z.number().int().min(1).max(8),
  title: z.string().min(1).max(160),
  prompt: z.string().max(32_000),
  agent: z.enum(["explore", "general"]),
  provider: z.string().max(200),
  model: z.string().max(200),
  status: z.enum(["queued", "working", "done", "failed", "cancelled"]),
  timestamp: z.string().datetime(),
  message: z.string().max(24_000).optional(),
})

export type SubagentEvent = z.infer<typeof subagentEventSchema>

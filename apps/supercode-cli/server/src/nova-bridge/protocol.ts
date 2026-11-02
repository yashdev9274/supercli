import { z } from "zod"

export const BRIDGE_VERSION = "nova-cli-harness/1"
export const startSchema = z.object({
  version: z.literal(BRIDGE_VERSION),
  mode: z.enum(["chat", "plan", "agent"]),
  messages: z.array(z.object({ role: z.enum(["system", "user", "assistant"]), content: z.string().max(200_000) })).min(1).max(100),
  tools: z.array(z.object({
    type: z.literal("function"),
    function: z.object({ name: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/), description: z.string().max(20_000), parameters: z.record(z.unknown()) }),
    access: z.enum(["read", "write", "execute", "state"]),
  })).max(128),
  budget: z.number().int().min(1).max(50).default(30),
}).strict().superRefine((input, ctx) => {
  if (new Set(input.tools.map((tool) => tool.function.name)).size !== input.tools.length) ctx.addIssue({ code: "custom", message: "Duplicate tools" })
})
export type BridgeStart = z.infer<typeof startSchema>
export type Handoff = {
  type: "handoff"
  id: string
  kind: "inference" | "tool"
  hash: string
  payload: Record<string, unknown>
}
export type BridgeMessage = Record<string, unknown>

import { z } from "zod"

import { ALL_MODELS } from "@/modules/nova-web/models"

const filterId = z.string().trim().max(200).default("")
const timezoneSchema = z.string().max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true } catch { return false }
}, "Choose a valid timezone")

export const triggerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("slack.message"), channel: filterId, actor: filterId, humansOnly: z.boolean().default(true) }),
  z.object({ type: z.literal("github.check"), repository: filterId, conclusions: z.array(z.enum(["failure", "timed_out", "action_required", "success", "cancelled", "neutral", "skipped", "stale"])).min(1).max(8) }),
  z.object({ type: z.literal("github.review"), repository: filterId, actor: filterId, states: z.array(z.enum(["changes_requested", "commented", "approved"])).min(1).max(3) }),
  z.object({ type: z.literal("linear.issue"), team: filterId }),
  z.object({ type: z.literal("schedule"), day: z.number().int().min(0).max(6), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), timezone: timezoneSchema }),
  z.object({ type: z.literal("webhook") }),
])
export type AutomationTrigger = z.infer<typeof triggerSchema>
export type TriggerType = AutomationTrigger["type"]

export const automationInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  instructions: z.string().trim().min(1, "Instructions are required").max(20_000),
  onlyRunWhen: z.string().trim().max(4_000).default(""),
  model: z.string().max(200),
  provider: z.string().max(100),
  effort: z.enum(["low", "medium", "high", "xhigh"]).default("medium"),
  triggers: z.array(triggerSchema).min(1, "Add at least one trigger").max(10),
  repositoryIds: z.array(z.string().min(1).max(64)).max(10).default([]),
  runAsMembershipId: z.string().min(1).max(64),
  maxRunsPerDay: z.number().int().min(1).max(100).default(10),
  cooldownMinutes: z.number().int().min(0).max(1440).default(5),
  status: z.enum(["active", "paused"]).default("active"),
  postAsRunAs: z.literal(false).default(false),
}).refine((value) => ALL_MODELS.some((model) => model.id === value.model && model.provider === value.provider), {
  message: "Select a supported model and provider", path: ["model"],
})
export type AutomationInput = z.infer<typeof automationInputSchema>

export const automationEventSchema = z.object({
  organizationId: z.string().min(1),
  deliveryId: z.string().min(1).max(300),
  type: z.enum(["slack.message", "github.check", "github.review", "linear.issue", "schedule", "webhook", "manual"]),
  installationId: z.string().optional(),
  actor: z.string().max(200).default(""),
  bot: z.boolean().default(false),
  channel: z.string().max(200).default(""),
  repository: z.string().max(200).default(""),
  team: z.string().max(200).default(""),
  conclusion: z.string().max(100).default(""),
  reviewState: z.string().max(100).default(""),
  text: z.string().max(24_000),
})
export type AutomationEvent = z.infer<typeof automationEventSchema>

export function matchesTrigger(trigger: AutomationTrigger, event: AutomationEvent): boolean {
  if (trigger.type !== event.type) return false
  switch (trigger.type) {
    case "slack.message": return (!trigger.channel || trigger.channel === event.channel) && (!trigger.actor || trigger.actor === event.actor) && (!trigger.humansOnly || !event.bot)
    case "github.check": return (!trigger.repository || trigger.repository === event.repository) && trigger.conclusions.some((value) => value === event.conclusion)
    case "github.review": return !event.bot && (!trigger.repository || trigger.repository === event.repository) && (!trigger.actor || trigger.actor === event.actor) && trigger.states.some((value) => value === event.reviewState)
    case "linear.issue": return !event.bot && (!trigger.team || trigger.team === event.team)
    case "schedule": return true
    case "webhook": return true
  }
}

export function canManageAutomation(member: { id: string; role: string }, creatorMembershipId: string): boolean {
  return member.id === creatorMembershipId || member.role === "owner" || member.role === "admin"
}

export function scheduleSlot(trigger: Extract<AutomationTrigger, { type: "schedule" }>, now: Date): string | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: trigger.timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday)
  if (day !== trigger.day || Number(values.hour) !== trigger.hour || Number(values.minute) !== trigger.minute) return null
  // Local wall-clock key also prevents double dispatch during a repeated DST hour.
  return `${values.year}-${values.month}-${values.day}:${values.hour}:${values.minute}:${trigger.timezone}`
}

export function limitReason(input: { count: number; maxRunsPerDay: number; lastRunAt: Date | null; cooldownMinutes: number; now: Date }): string | null {
  if (input.count >= input.maxRunsPerDay) return "Daily run limit reached"
  if (input.lastRunAt && input.now.getTime() - input.lastRunAt.getTime() < input.cooldownMinutes * 60_000) return "Cooldown is active"
  return null
}

export type AutomationDto = AutomationInput & {
  id: string
  creatorMembershipId: string
  creatorName: string
  runAsName: string
  canManage: boolean
  createdAt: string
  updatedAt: string
  lastRunAt: string | null
  runs: Array<{ id: string; status: string; reason: string | null; agentSessionId: string | null; createdAt: string; completedAt: string | null }>
}
export type AutomationContext = {
  organizationName: string
  membershipId: string
  members: Array<{ id: string; name: string }>
  repositories: Array<{ id: string; fullName: string }>
  connections: Array<{ provider: string; connected: boolean }>
}

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  "slack.message": "Any message", "github.check": "Check completed", "github.review": "Review submitted", "linear.issue": "Issue created", schedule: "Weekly schedule", webhook: "Webhook received",
}

export function defaultTrigger(type: TriggerType): AutomationTrigger {
  switch (type) {
    case "slack.message": return { type, channel: "", actor: "", humansOnly: true }
    case "github.check": return { type, repository: "", conclusions: ["failure", "timed_out", "action_required"] }
    case "github.review": return { type, repository: "", actor: "", states: ["changes_requested"] }
    case "linear.issue": return { type, team: "" }
    case "schedule": return { type, day: 1, hour: 9, minute: 0, timezone: "UTC" }
    case "webhook": return { type }
  }
}

import { z } from "zod"

import { automationEventSchema, type AutomationEvent } from "./contracts"

const object = z.record(z.string(), z.unknown())
const slackSchema = z.object({
  type: z.literal("event_callback"), event_id: z.string(),
  event: z.object({ type: z.enum(["message", "app_mention"]), subtype: z.string().optional(), user: z.string().optional(), bot_id: z.string().optional(), channel: z.string(), text: z.string(), ts: z.string(), thread_ts: z.string().optional(), files: z.array(object).optional() }),
})
const githubSchema = z.object({
  action: z.string(), repository: z.object({ full_name: z.string() }),
  sender: z.object({ login: z.string(), type: z.string().optional() }).optional(),
  check_run: z.object({ id: z.number(), name: z.string().optional(), conclusion: z.string().nullable().optional(), details_url: z.string().nullable().optional(), head_sha: z.string().optional(), pull_requests: z.array(object).optional(), output: object.optional() }).optional(),
  review: z.object({ id: z.number(), state: z.string(), body: z.string().nullable().optional(), html_url: z.string().optional() }).optional(),
  pull_request: z.object({ number: z.number(), title: z.string().optional(), html_url: z.string().optional() }).optional(),
})
const linearSchema = z.object({
  type: z.literal("Issue"), action: z.literal("create"),
  actor: z.object({ id: z.string().optional(), type: z.string().optional() }).optional(),
  data: z.object({ id: z.string(), title: z.string(), description: z.string().nullable().optional(), teamId: z.string().optional(), team: z.object({ id: z.string() }).optional(), identifier: z.string().optional(), url: z.string().optional(), priority: z.number().optional(), labels: z.array(object).optional() }),
})

type ProviderContext = { organizationId: string; installationId: string; deliveryId: string; botExternalUserId: string | null }

export function normalizeAutomationProviderEvent(provider: "slack" | "github" | "linear", raw: unknown, context: ProviderContext, eventName?: string): AutomationEvent | null {
  const base = { organizationId: context.organizationId, installationId: context.installationId }
  if (provider === "slack") {
    const parsed = slackSchema.safeParse(raw)
    if (!parsed.success) return null
    const { event, event_id } = parsed.data
    if (event.subtype && event.subtype !== "bot_message") return null
    if (context.botExternalUserId && event.user === context.botExternalUserId) return null
    return automationEventSchema.parse({ ...base, deliveryId: `slack:${event_id}`, type: "slack.message", actor: event.user ?? event.bot_id ?? "", bot: Boolean(event.bot_id || event.subtype === "bot_message"), channel: event.channel, text: JSON.stringify({ text: event.text, channel: event.channel, timestamp: event.ts, threadTimestamp: event.thread_ts ?? event.ts, files: event.files ?? [] }).slice(0, 24_000) })
  }
  if (provider === "github") {
    const parsed = githubSchema.safeParse(raw)
    if (!parsed.success) return null
    const value = parsed.data
    if (context.botExternalUserId && value.sender?.login === context.botExternalUserId) return null
    const common = { ...base, deliveryId: `github:${context.deliveryId}`, actor: value.sender?.login ?? "", bot: value.sender?.type === "Bot", repository: value.repository.full_name }
    if (eventName === "check_run" && value.action === "completed" && value.check_run?.conclusion) {
      return automationEventSchema.parse({ ...common, type: "github.check", conclusion: value.check_run.conclusion, text: JSON.stringify({ repository: value.repository.full_name, check: value.check_run }).slice(0, 24_000) })
    }
    if (eventName === "pull_request_review" && value.action === "submitted" && value.review && value.pull_request) {
      return automationEventSchema.parse({ ...common, type: "github.review", reviewState: value.review.state.toLowerCase(), text: JSON.stringify({ repository: value.repository.full_name, review: value.review, pullRequest: value.pull_request }).slice(0, 24_000) })
    }
    return null
  }
  const parsed = linearSchema.safeParse(raw)
  if (!parsed.success) return null
  const { data, actor } = parsed.data
  if (context.botExternalUserId && actor?.id === context.botExternalUserId) return null
  return automationEventSchema.parse({ ...base, deliveryId: `linear:${context.deliveryId}`, type: "linear.issue", actor: actor?.id ?? "", bot: actor?.type === "Bot", team: data.teamId ?? data.team?.id ?? "", text: JSON.stringify(data).slice(0, 24_000) })
}

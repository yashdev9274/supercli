import { z } from "zod"

const timezone = z.string().trim().min(1).max(100).refine((value) => {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }); return true } catch { return false }
}, "Choose a valid timezone")

export const routineInputSchema = z.object({
  name: z.string().trim().min(1).max(160), instructions: z.string().trim().min(1).max(20_000),
  scheduleType: z.enum(["daily", "weekly"]).default("daily"), dayOfWeek: z.number().int().min(0).max(6).nullable().default(null),
  hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), timezone,
  requiresCalendar: z.boolean().default(false), separateThread: z.boolean().default(false), status: z.enum(["active", "paused"]).default("active"),
}).superRefine((value, ctx) => { if (value.scheduleType === "weekly" && value.dayOfWeek === null) ctx.addIssue({ code: "custom", path: ["dayOfWeek"], message: "Choose a weekday" }) })
export type RoutineInput = z.infer<typeof routineInputSchema>
export type RoutineDto = RoutineInput & { id: string; agentId: string; createdAt: string; updatedAt: string; lastRunAt: string | null; runs: Array<{ id: string; status: string; reason: string | null; createdAt: string; completedAt: string | null }> }
export function routineSlot(routine: Pick<RoutineInput, "scheduleType" | "dayOfWeek" | "hour" | "minute" | "timezone">, now: Date): string | null {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: routine.timezone, weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday)
  if (routine.scheduleType === "weekly" && day !== routine.dayOfWeek) return null
  if (Number(values.hour) !== routine.hour || Number(values.minute) !== routine.minute) return null
  return `${values.year}-${values.month}-${values.day}:${values.hour}:${values.minute}:${routine.timezone}`
}

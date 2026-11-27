import { z } from "zod"

const actions = {
  list_apps: z.object({}).strict(),
  list_windows: z.object({}).strict(),
  get_window_state: z.object({
    pid: z.number().int().min(1).max(2147483647),
    window_id: z.number().int().min(0).max(4294967295),
  }).strict(),
} as const

export function isAllowedAction(name: string, capability: string, args: unknown): boolean {
  if (!Object.hasOwn(actions, name) || capability !== `nova-harness:${name}`) return false
  return actions[name as keyof typeof actions].safeParse(args).success
}

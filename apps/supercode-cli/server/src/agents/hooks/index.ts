export type HookEvent =
  | { type: "turn_start"; agent: string }
  | { type: "turn_end"; agent: string; text: string; error?: string }
  | { type: "tool_start"; agent: string; toolName: string; args?: unknown }
  | {
      type: "tool_end"
      agent: string
      toolName: string
      result?: unknown
      error?: string
    }
  | { type: "step_finish"; agent: string; step: unknown }

export type HookListener = (event: HookEvent) => void | Promise<void>

const listeners = new Set<HookListener>()

export function addHookListener(fn: HookListener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function clearHookListeners(): void {
  listeners.clear()
}

export async function emitHook(event: HookEvent): Promise<void> {
  for (const fn of listeners) {
    try {
      await fn(event)
    } catch (err) {
      console.warn(`[agents/hooks] listener error:`, err)
    }
  }
}

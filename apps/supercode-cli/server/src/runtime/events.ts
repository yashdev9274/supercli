/**
 * Shared turn event shapes for harness → CLI TUI / chalk adapters.
 * Every provider/model path must emit these — not private per-vendor events.
 */

export type TurnEvent =
  | { type: "status"; message: string }
  | { type: "reasoning"; delta: string }
  | { type: "text"; delta: string }
  | { type: "tool_start"; toolName: string; args?: unknown; id?: string }
  | { type: "tool_end"; toolName: string; result?: unknown; id?: string; durationMs?: number }
  | { type: "finish"; text: string; reasoning?: string; finishReason?: string }
  | { type: "error"; message: string; cause?: unknown }

export type TurnEventListener = (event: TurnEvent) => void

export function createEventBus() {
  const listeners = new Set<TurnEventListener>()

  return {
    subscribe(listener: TurnEventListener): () => void {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    emit(event: TurnEvent): void {
      for (const listener of listeners) {
        try {
          listener(event)
        } catch {
          // UI listeners must not break the turn pipeline
        }
      }
    },
    clear(): void {
      listeners.clear()
    },
  }
}

export type EventBus = ReturnType<typeof createEventBus>

import { createEventBus, type EventBus, type TurnEvent } from "src/cli/runtime/event-bus.ts"
import { agentIdForMode, runUnifiedTurn } from "src/cli/runtime/turn-runner.ts"
import { loadSessionTools } from "src/cli/runtime/tool-loader.ts"
import type { GenerateResult } from "src/agents"
import type { ModelProvider } from "src/cli/ai/provider"

export type SessionState = {
  provider: string
  model: string
  mode: string
  messages: Array<{ role: "user" | "assistant" | "system"; content: string }>
  abort?: AbortController
}

/**
 * Conversation controller used by chalk (Phase 2) and OpenTUI (Phase 3+).
 * All turns go through runUnifiedTurn — no provider-private loops here.
 */
export function createSessionController(initial: {
  provider: string
  model: string
  mode?: string
  system?: string
}) {
  const bus: EventBus = createEventBus()
  const state: SessionState = {
    provider: initial.provider,
    model: initial.model,
    mode: initial.mode ?? "chat",
    messages: initial.system
      ? [{ role: "system", content: initial.system }]
      : [],
  }

  return {
    bus,
    getState: () => ({ ...state, messages: [...state.messages] }),
    setMode(mode: string) {
      state.mode = mode
    },
    setModel(provider: string, model: string) {
      state.provider = provider
      state.model = model
    },
    abort() {
      state.abort?.abort()
    },
    subscribe(listener: (e: TurnEvent) => void) {
      return bus.subscribe(listener)
    },
    async runUserTurn(opts: {
      text: string
      system?: string
    }): Promise<GenerateResult> {
      state.abort?.abort()
      state.abort = new AbortController()
      state.messages.push({ role: "user", content: opts.text })

      const { tools } = await loadSessionTools({ mode: state.mode })
      const agent = agentIdForMode(state.mode)

      const result = await runUnifiedTurn({
        provider: state.provider as ModelProvider,
        modelId: state.model,
        agent,
        tools,
        messages: state.messages,
        system: opts.system,
        signal: state.abort.signal,
        bus,
      })

      if (result.text) {
        state.messages.push({ role: "assistant", content: result.text })
      }
      return result
    },
  }
}

export type SessionController = ReturnType<typeof createSessionController>

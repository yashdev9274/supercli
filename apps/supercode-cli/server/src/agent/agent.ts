import type { RulesetArray } from "src/permission"

export interface AgentInfo {
  name: string
  description?: string
  mode: "subagent" | "primary" | "all"
  native?: boolean
  hidden?: boolean
  topP?: number
  temperature?: number
  color?: string
  permission: RulesetArray
  model?: { modelID: string; providerID: string }
  variant?: string
  prompt?: string
  options: Record<string, unknown>
  steps?: number
}

export interface GenerateOptions {
  model?: { modelID: string; providerID: string }
  onStepFinish?: (step: unknown) => void
  signal?: AbortSignal
}

export interface GenerateResult {
  text: string
  toolCalls?: unknown[]
  finishReason?: string
}

export interface Agent {
  info: AgentInfo
  generate?: (
    sessionId: string,
    prompt: string,
    opts?: GenerateOptions,
  ) => Promise<GenerateResult>
}

export interface AgentService {
  get(id: string): Agent | undefined
  register(agent: Agent): void
  list(opts?: { includeHidden?: boolean }): Agent[]
  unregister(id: string): void
}

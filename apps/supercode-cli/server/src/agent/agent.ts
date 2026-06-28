import type { LanguageModel } from "ai"
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
  steps?: number
  options: Record<string, unknown>
}

export interface GenerateOptions {
  model: LanguageModel
  tools?: Record<string, unknown>
  messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>
  prompt?: string
  system?: string
  onStepFinish?: (step: unknown) => void
  onChunk?: (chunk: string) => void
  onToolCall?: (params: { toolName: string; args?: unknown }) => void
  signal?: AbortSignal
  budget?: number
}

export interface GenerateResult {
  text: string
  toolCalls?: Array<{ toolName: string; args?: unknown }>
  finishReason?: string
  tokens?: { input: number; output: number }
  filesRead?: string[]
  filesChanged?: string[]
  error?: string
}

export interface Agent {
  info: AgentInfo
  /**
   * Resolve the system prompt. Accepts an override; falls back to the
   * prompt file specified in info.prompt, or undefined.
   */
  resolvePrompt?: (override?: string) => string | undefined
  generate?: (opts: GenerateOptions) => Promise<GenerateResult>
}

export interface AgentService {
  get(id: string): Agent | undefined
  register(agent: Agent): void
  list(opts?: { includeHidden?: boolean; mode?: AgentInfo["mode"] }): Agent[]
  unregister(id: string): void
}
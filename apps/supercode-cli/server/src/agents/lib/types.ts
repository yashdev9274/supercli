import type { LanguageModel } from "ai"
import type { RulesetArray } from "src/permission"
import type { DefinedAgent, DefinedTool } from "./define.ts"

/** Legacy-compatible agent info shape used by permission manager + callers. */
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
  /** Visible answer text delta (after think-split). */
  onChunk?: (chunk: string) => void
  /** Private process / reasoning delta (tags + channel). */
  onReasoning?: (chunk: string) => void
  onStatus?: (message: string) => void
  onToolCall?: (params: { id?: string; toolName: string; args?: unknown }) => void
  onToolResult?: (params: { id?: string; toolName: string; args?: unknown; result?: unknown }) => void
  signal?: AbortSignal
  budget?: number
  parentAgent?: string
}

export interface GenerateResult {
  text: string
  /** Accumulated private reasoning / CoT for this turn. */
  reasoning?: string
  toolCalls?: Array<{ toolName: string; args?: unknown }>
  finishReason?: string
  tokens?: { input: number; output: number }
  filesRead?: string[]
  filesChanged?: string[]
  error?: string
}

export interface Agent {
  info: AgentInfo
  resolvePrompt?: (override?: string) => string | undefined
  generate?: (opts: GenerateOptions) => Promise<GenerateResult>
}

export interface AgentService {
  get(id: string): Agent | undefined
  register(agent: Agent): void
  list(opts?: { includeHidden?: boolean; mode?: AgentInfo["mode"] }): Agent[]
  unregister(id: string): void
}

export type ToolCategory = "read" | "write" | "execute" | "web" | "agent"

export interface ToolMeta {
  category: ToolCategory
  requiresPermission: boolean
  description: string
}

export interface Harness {
  runTurn(opts: GenerateOptions & { agent?: string }): Promise<GenerateResult>
  getAgent(id: string): Agent | undefined
  listAgents(opts?: { includeHidden?: boolean; mode?: AgentInfo["mode"] }): Agent[]
  loadTools(): Record<string, unknown>
  getToolMeta(): Record<string, ToolMeta>
}

export type { DefinedAgent, DefinedTool }

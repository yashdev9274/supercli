import { tool, type Tool } from "ai"
import type { z } from "zod"
import type { RulesetArray } from "src/permission"

export type ApprovalMode = "always" | "once" | "ask" | "deny"

export interface DefineToolOptions<T extends z.ZodTypeAny> {
  description: string
  inputSchema: T
  execute: (args: z.infer<T>, ctx?: ToolExecuteContext) => Promise<unknown>
  /** Optional static approval hint; runtime still goes through permission manager. */
  approval?: ApprovalMode
  /** Optional display name override; default is the discovered filename slug. */
  name?: string
}

export interface ToolExecuteContext {
  agentName?: string
  parentAgent?: string
  signal?: AbortSignal
}

export interface DefinedTool<T extends z.ZodTypeAny = z.ZodTypeAny> {
  kind: "tool"
  description: string
  inputSchema: T
  execute: (args: z.infer<T>, ctx?: ToolExecuteContext) => Promise<unknown>
  approval?: ApprovalMode
  name?: string
  /** AI SDK tool instance for streamText / generateText */
  sdk: Tool
}

export function defineTool<T extends z.ZodTypeAny>(
  opts: DefineToolOptions<T>,
): DefinedTool<T> {
  const sdk = tool({
    description: opts.description,
    inputSchema: opts.inputSchema,
    execute: async (input: z.infer<T>) => opts.execute(input),
  })

  return {
    kind: "tool",
    description: opts.description,
    inputSchema: opts.inputSchema,
    execute: opts.execute,
    approval: opts.approval,
    name: opts.name,
    sdk,
  }
}

export interface DefineAgentOptions {
  name: string
  description?: string
  mode?: "subagent" | "primary" | "all"
  hidden?: boolean
  native?: boolean
  temperature?: number
  topP?: number
  color?: string
  steps?: number
  permission: RulesetArray
  /** Relative path key for instructions.md (or legacy prompt name). */
  instructions?: string
  /** Explicit tool name allowlist; undefined = all discovered tools filtered by permission. */
  tools?: string[]
  model?: { modelID: string; providerID: string }
  variant?: string
  options?: Record<string, unknown>
}

export interface DefinedAgent {
  kind: "agent"
  info: {
    name: string
    description?: string
    mode: "subagent" | "primary" | "all"
    native: boolean
    hidden: boolean
    temperature: number
    topP?: number
    color?: string
    steps?: number
    permission: RulesetArray
    instructions?: string
    tools?: string[]
    model?: { modelID: string; providerID: string }
    variant?: string
    options: Record<string, unknown>
    /** Compat with legacy AgentInfo.prompt */
    prompt?: string
  }
}

export function defineAgent(opts: DefineAgentOptions): DefinedAgent {
  return {
    kind: "agent",
    info: {
      name: opts.name,
      description: opts.description,
      mode: opts.mode ?? "primary",
      native: opts.native ?? true,
      hidden: opts.hidden ?? false,
      temperature: opts.temperature ?? 0,
      topP: opts.topP,
      color: opts.color,
      steps: opts.steps,
      permission: opts.permission,
      instructions: opts.instructions,
      tools: opts.tools,
      model: opts.model,
      variant: opts.variant,
      options: opts.options ?? {},
      prompt: opts.instructions,
    },
  }
}

export interface DefineSkillOptions {
  name: string
  description: string
  /** Absolute or workspace-relative path to SKILL.md body */
  path?: string
  body?: string
}

export interface DefinedSkill {
  kind: "skill"
  name: string
  description: string
  path?: string
  body?: string
}

export function defineSkill(opts: DefineSkillOptions): DefinedSkill {
  return {
    kind: "skill",
    name: opts.name,
    description: opts.description,
    path: opts.path,
    body: opts.body,
  }
}

import { createHarness as createHarnessImpl, runAgent } from "./lib/harness.ts"
import type {
  Agent,
  AgentInfo,
  GenerateOptions,
  GenerateResult,
  Harness,
  ToolMeta,
} from "./lib/types.ts"
import {
  agentService,
  DefaultAgentService,
  registerBuiltInAgents,
  getAgentPrompt,
} from "./service.ts"
import { tools, toolMeta } from "./tools/registry.ts"
import {
  loadInstructions,
  loadInstructionsSync,
  discoverTools,
  loadToolsSdk,
  loadToolMeta,
  discoverSkills,
  AGENTS_ROOT,
} from "./lib/discover.ts"
import { defineTool, defineAgent, defineSkill } from "./lib/define.ts"
import { addHookListener, clearHookListeners } from "./hooks/index.ts"
import { mergeParentChildPermissions, resolveAgentRuleset } from "./lib/subagent-permissions.ts"

export type {
  Agent,
  AgentInfo,
  GenerateOptions,
  GenerateResult,
  Harness,
  ToolMeta,
} from "./lib/types.ts"

export {
  defineTool,
  defineAgent,
  defineSkill,
  agentService,
  DefaultAgentService,
  registerBuiltInAgents,
  getAgentPrompt,
  runAgent,
  tools,
  toolMeta,
  loadInstructions,
  loadInstructionsSync,
  discoverTools,
  loadToolsSdk,
  loadToolMeta,
  discoverSkills,
  AGENTS_ROOT,
  addHookListener,
  clearHookListeners,
  mergeParentChildPermissions,
  resolveAgentRuleset,
}

/** Prompt helpers matching legacy agent API. */
export async function loadPrompt(name: string): Promise<string | undefined> {
  return loadInstructions(name)
}

export function loadPromptSync(name: string): string | undefined {
  return loadInstructionsSync(name)
}

export function promptExists(name: string): boolean {
  return !!loadInstructionsSync(name)
}

export function promptPath(name: string): string {
  // best-effort path for debug
  return `${AGENTS_ROOT}/subagents/${name}/instructions.md`
}

export async function listPrompts(): Promise<string[]> {
  return ["build", "plan", "explore", "general", "compaction", "title", "summary"]
}

let defaultHarness: Harness | null = null

export function createHarness(): Harness {
  return createHarnessImpl({
    agents: agentService.asMap(),
    loadTools: () => tools,
    getToolMeta: () => toolMeta,
    defaultAgent: "build",
  })
}

function getDefaultHarness(): Harness {
  if (!defaultHarness) defaultHarness = createHarness()
  return defaultHarness
}

export async function runTurn(
  opts: GenerateOptions & { agent?: string },
): Promise<GenerateResult> {
  return getDefaultHarness().runTurn(opts)
}

export function getAgent(id: string): Agent | undefined {
  return agentService.get(id)
}

export function listAgents(opts?: {
  includeHidden?: boolean
  mode?: AgentInfo["mode"]
}): Agent[] {
  return agentService.list(opts)
}

export function loadTools(): Record<string, unknown> {
  return { ...tools }
}

export type { AgentService } from "./lib/types.ts"

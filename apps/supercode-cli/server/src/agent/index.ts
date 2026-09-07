/**
 * @deprecated Prefer `src/agents` (plural). This module re-exports the new harness.
 */
export {
  type Agent,
  type AgentInfo,
  type AgentService,
  type GenerateOptions,
  type GenerateResult,
  DefaultAgentService,
  registerBuiltInAgents,
  getAgentPrompt,
  agentService,
  runAgent,
  loadPrompt,
  loadPromptSync,
  promptExists,
  promptPath,
  listPrompts,
  mergeParentChildPermissions,
  resolveAgentRuleset,
} from "src/agents"

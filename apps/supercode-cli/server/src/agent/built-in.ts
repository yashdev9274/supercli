import type { AgentService, AgentInfo, Agent } from "./agent"
import type { RulesetArray } from "src/permission"
import { runAgent } from "./runner"
import { loadPrompt } from "./prompt-loader"

function info(
  overrides: Partial<AgentInfo> & { name: string; permission: RulesetArray },
): AgentInfo {
  return {
    mode: "primary",
    native: true,
    hidden: false,
    temperature: 0,
    options: {},
    ...overrides,
  }
}

//
// Build agent — full-stack application builder. Write access. Default agent
// when the user is in agent mode. Allows write_file/run_command/code_exec;
// dangerous commands still trigger an "ask" prompt because of the second rule.
//
const buildInfo: AgentInfo = info({
  name: "build",
  description: "Full-stack application builder with write access. The default agent.",
  mode: "primary",
  steps: 50,
  permission: [
    { permission: "*", pattern: "*", action: "allow" },
    {
      permission: "run_command",
      pattern: "rm -rf *",
      action: "ask",
      reason: "Destructive",
    },
  ],
})

//
// Plan agent — read-only. Can read, search, fetch URLs, web search, read
// instructions. Cannot write files, run commands, or execute code.
//
// Ruleset ordering: catch-all deny first, specific allows AFTER, so
// findLast-match picks the specific allow over the catch-all.
//
const planInfo: AgentInfo = info({
  name: "plan",
  description: "Read-only code analysis and planning. Cannot modify files.",
  mode: "primary",
  steps: 30,
  permission: [
    { permission: "*", pattern: "*", action: "deny" },
    { permission: "read_file", pattern: "*", action: "allow" },
    { permission: "search_files", pattern: "*", action: "allow" },
    { permission: "url_fetch", pattern: "*", action: "allow" },
    { permission: "web_search", pattern: "*", action: "allow" },
    { permission: "read_instructions", pattern: "*", action: "allow" },
    { permission: "task", pattern: "*", action: "allow" },
  ],
  prompt: "plan",
})

//
// General-purpose subagent. Has write access but dangerous commands still
// ask. Used as a fallback when the parent doesn't specify `agent: "explore"`.
//
const generalInfo: AgentInfo = info({
  name: "general",
  description:
    "General-purpose agent for researching complex questions and executing multi-step tasks.",
  mode: "subagent",
  steps: 20,
  permission: [
    { permission: "*", pattern: "*", action: "allow" },
    {
      permission: "run_command",
      pattern: "rm -rf *",
      action: "ask",
      reason: "Destructive",
    },
  ],
  prompt: "general",
})

//
// Explore subagent. Read-only by design. The classic "find me X" agent.
// Even if the parent passes `tools: ["write_file"]`, the agent's ruleset
// denies it. (Phase 5 enforcement: parent grant is filtered by agent policy.)
//
// Ruleset ordering: catch-all deny first, specific allows AFTER, so
// findLast-match picks the specific allow over the catch-all.
//
const exploreInfo: AgentInfo = info({
  name: "explore",
  description: "Fast file search specialist. Reads and searches only — no modifications.",
  mode: "subagent",
  steps: 8,
  permission: [
    { permission: "*", pattern: "*", action: "deny" },
    { permission: "read_file", pattern: "*", action: "allow" },
    { permission: "search_files", pattern: "*", action: "allow" },
    { permission: "read_instructions", pattern: "*", action: "allow" },
    { permission: "url_fetch", pattern: "*", action: "allow" },
    { permission: "web_search", pattern: "*", action: "allow" },
    { permission: "task", pattern: "*", action: "allow" },
  ],
  prompt: "explore",
})

//
// Internal agents — hidden from the user-facing list. Always invoked
// programmatically (compaction, title generation, session summary).
//
const compactionInfo: AgentInfo = info({
  name: "compaction",
  description: "Internal agent for context compaction.",
  hidden: true,
  mode: "all",
  steps: 1,
  temperature: 0,
  permission: [{ permission: "*", pattern: "*", action: "deny" }],
  prompt: "compaction",
})

const titleInfo: AgentInfo = info({
  name: "title",
  description: "Internal agent for conversation title generation.",
  hidden: true,
  mode: "all",
  steps: 1,
  temperature: 0.5,
  permission: [{ permission: "*", pattern: "*", action: "deny" }],
  prompt: "title",
})

const summaryInfo: AgentInfo = info({
  name: "summary",
  description: "Internal agent for session summary generation.",
  hidden: true,
  mode: "all",
  steps: 1,
  temperature: 0,
  permission: [{ permission: "*", pattern: "*", action: "deny" }],
  prompt: "summary",
})

/**
 * Build an Agent that wires AgentInfo → runAgent. Hidden agents also get
 * the same generate() shape — internal callers (compactor, title picker)
 * use it directly.
 */
function makeAgent(info: AgentInfo): Agent {
  return {
    info,
    async generate(opts) {
      const result = await runAgent({ info } as Agent, opts)
      return result
    },
  }
}

export function registerBuiltInAgents(service: AgentService): void {
  for (const agentInfo of [
    buildInfo,
    planInfo,
    generalInfo,
    exploreInfo,
    compactionInfo,
    titleInfo,
    summaryInfo,
  ]) {
    service.register(makeAgent(agentInfo))
  }
}

// Lazy prompt loader hook — not used by runAgent (which loads async) but
// handy for callers that want a synchronous peek at the prompt body.
export async function getAgentPrompt(name: string): Promise<string | undefined> {
  return loadPrompt(name)
}
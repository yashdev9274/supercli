import type { AgentService, AgentInfo } from "./agent"
import type { RulesetArray } from "src/permission"

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

const buildInfo: AgentInfo = info({
  name: "build",
  description: "Full-stack application builder with write access. The default agent.",
  permission: [
    { permission: "*", pattern: "*", action: "allow" },
    { permission: "run_command", pattern: "rm -rf *", action: "deny", reason: "Destructive" },
  ],
})

const planInfo: AgentInfo = info({
  name: "plan",
  description: "Read-only code analysis and planning. Cannot modify files.",
  permission: [
    { permission: "read_file", pattern: "*", action: "allow" },
    { permission: "search_files", pattern: "*", action: "allow" },
    { permission: "url_fetch", pattern: "*", action: "allow" },
    { permission: "web_search", pattern: "*", action: "allow" },
    { permission: "read_instructions", pattern: "*", action: "allow" },
    { permission: "write_file", pattern: "*", action: "deny", reason: "Plan mode is read-only" },
    { permission: "run_command", pattern: "*", action: "deny", reason: "Plan mode is read-only" },
    { permission: "code_exec", pattern: "*", action: "deny", reason: "Plan mode is read-only" },
    { permission: "*", pattern: "*", action: "deny" },
  ],
})

const generalInfo: AgentInfo = info({
  name: "general",
  description: "General-purpose agent for researching complex questions and executing multi-step tasks.",
  mode: "subagent",
  permission: [
    { permission: "*", pattern: "*", action: "allow" },
    { permission: "todowrite", pattern: "*", action: "deny" },
  ],
})

const exploreInfo: AgentInfo = info({
  name: "explore",
  description: "Fast file search specialist. Reads and searches only — no modifications.",
  mode: "subagent",
  permission: [
    { permission: "*", pattern: "*", action: "deny" },
    { permission: "grep", pattern: "*", action: "allow" },
    { permission: "glob", pattern: "*", action: "allow" },
    { permission: "list", pattern: "*", action: "allow" },
    { permission: "bash", pattern: "*", action: "allow" },
    { permission: "webfetch", pattern: "*", action: "allow" },
    { permission: "websearch", pattern: "*", action: "allow" },
    { permission: "read", pattern: "*", action: "allow" },
    { permission: "search_files", pattern: "*", action: "allow" },
    { permission: "url_fetch", pattern: "*", action: "allow" },
    { permission: "web_search", pattern: "*", action: "allow" },
    { permission: "read_file", pattern: "*", action: "allow" },
    { permission: "read_instructions", pattern: "*", action: "allow" },
  ],
  prompt: "prompts/explore.txt",
})

const compactionInfo: AgentInfo = info({
  name: "compaction",
  description: "Internal agent for context compaction.",
  hidden: true,
  permission: [{ permission: "*", pattern: "*", action: "deny" }],
  prompt: "prompts/compaction.txt",
})

const titleInfo: AgentInfo = info({
  name: "title",
  description: "Internal agent for conversation title generation.",
  hidden: true,
  temperature: 0.5,
  permission: [{ permission: "*", pattern: "*", action: "deny" }],
  prompt: "prompts/title.txt",
})

const summaryInfo: AgentInfo = info({
  name: "summary",
  description: "Internal agent for session summary generation.",
  hidden: true,
  permission: [{ permission: "*", pattern: "*", action: "deny" }],
  prompt: "prompts/summary.txt",
})

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
    service.register({ info: agentInfo })
  }
}

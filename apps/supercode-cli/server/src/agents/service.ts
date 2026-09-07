import type { Agent, AgentInfo, AgentService, GenerateOptions } from "./lib/types.ts"
import { loadInstructions, loadInstructionsSync } from "./lib/discover.ts"
import type { DefinedAgent } from "./lib/define.ts"
import { defineAgent } from "./lib/define.ts"
import type { RulesetArray } from "src/permission"

export class DefaultAgentService implements AgentService {
  private agents = new Map<string, Agent>()

  get(id: string): Agent | undefined {
    return this.agents.get(id)
  }

  register(agent: Agent): void {
    this.agents.set(agent.info.name, agent)
  }

  list(opts?: { includeHidden?: boolean; mode?: AgentInfo["mode"] }): Agent[] {
    let all = Array.from(this.agents.values())
    if (!opts?.includeHidden) {
      all = all.filter((a) => !a.info.hidden)
    }
    if (opts?.mode) {
      all = all.filter((a) => a.info.mode === opts.mode || a.info.mode === "all")
    }
    return all
  }

  unregister(id: string): void {
    this.agents.delete(id)
  }

  /** Internal map for harness construction. */
  asMap(): Map<string, Agent> {
    return this.agents
  }
}

function makeAgent(def: DefinedAgent): Agent {
  const info: AgentInfo = {
    name: def.info.name,
    description: def.info.description,
    mode: def.info.mode,
    native: def.info.native,
    hidden: def.info.hidden,
    temperature: def.info.temperature,
    topP: def.info.topP,
    color: def.info.color,
    permission: def.info.permission,
    model: def.info.model,
    variant: def.info.variant,
    prompt: def.info.instructions ?? def.info.prompt,
    steps: def.info.steps,
    options: def.info.options,
  }

  return {
    info,
    resolvePrompt(override?: string) {
      if (override) return override
      return loadInstructionsSync(info.prompt ?? info.name)
    },
    async generate(opts: GenerateOptions) {
      // Lazy import avoids service ↔ harness ↔ permission-manager cycle
      const { runAgent } = await import("./lib/harness.ts")
      return runAgent({ info } as Agent, opts)
    },
  }
}

/** Inline catalog so bootstrap does not need dynamic import of agent.ts files (faster + no cycle). */
function builtInCatalog(): DefinedAgent[] {
  const allowAll: RulesetArray = [
    { permission: "*", pattern: "*", action: "allow" },
    {
      permission: "run_command",
      pattern: "rm -rf *",
      action: "ask",
      reason: "Destructive",
    },
  ]
  const readOnly: RulesetArray = [
    { permission: "*", pattern: "*", action: "deny" },
    { permission: "read_file", pattern: "*", action: "allow" },
    { permission: "search_files", pattern: "*", action: "allow" },
    { permission: "url_fetch", pattern: "*", action: "allow" },
    { permission: "web_search", pattern: "*", action: "allow" },
    { permission: "firecrawl_search", pattern: "*", action: "allow" },
    { permission: "firecrawl_scrape", pattern: "*", action: "allow" },
    { permission: "firecrawl_map", pattern: "*", action: "allow" },
    { permission: "exa_search", pattern: "*", action: "allow" },
    { permission: "exa_fetch", pattern: "*", action: "allow" },
    { permission: "read_instructions", pattern: "*", action: "allow" },
    { permission: "task", pattern: "*", action: "allow" },
  ]
  const denyAll: RulesetArray = [{ permission: "*", pattern: "*", action: "deny" }]

  return [
    defineAgent({
      name: "build",
      description: "Full-stack application builder with write access. The default agent.",
      mode: "primary",
      steps: 50,
      instructions: "build",
      permission: allowAll,
    }),
    defineAgent({
      name: "plan",
      description: "Read-only code analysis and planning. Cannot modify files.",
      mode: "primary",
      steps: 30,
      instructions: "plan",
      permission: readOnly,
    }),
    defineAgent({
      name: "general",
      description:
        "General-purpose agent for researching complex questions and executing multi-step tasks.",
      mode: "subagent",
      steps: 20,
      instructions: "general",
      permission: allowAll,
    }),
    defineAgent({
      name: "explore",
      description: "Fast file search specialist. Reads and searches only — no modifications.",
      mode: "subagent",
      steps: 8,
      instructions: "explore",
      permission: readOnly,
    }),
    defineAgent({
      name: "compaction",
      description: "Internal agent for context compaction.",
      hidden: true,
      mode: "all",
      steps: 1,
      temperature: 0,
      instructions: "compaction",
      permission: denyAll,
    }),
    defineAgent({
      name: "title",
      description: "Internal agent for conversation title generation.",
      hidden: true,
      mode: "all",
      steps: 1,
      temperature: 0.5,
      instructions: "title",
      permission: denyAll,
    }),
    defineAgent({
      name: "summary",
      description: "Internal agent for session summary generation.",
      hidden: true,
      mode: "all",
      steps: 1,
      temperature: 0,
      instructions: "summary",
      permission: denyAll,
    }),
  ]
}

export function registerBuiltInAgents(service: AgentService): void {
  for (const def of builtInCatalog()) {
    service.register(makeAgent(def))
  }
}

export async function getAgentPrompt(name: string): Promise<string | undefined> {
  return loadInstructions(name)
}

const agentService = new DefaultAgentService()
registerBuiltInAgents(agentService)

export { agentService }

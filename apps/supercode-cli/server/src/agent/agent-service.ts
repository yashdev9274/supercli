import type { AgentService, Agent, AgentInfo } from "./agent"

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
}
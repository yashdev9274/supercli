import type { AgentService, Agent } from "./agent"

export class DefaultAgentService implements AgentService {
  private agents = new Map<string, Agent>()

  get(id: string): Agent | undefined {
    return this.agents.get(id)
  }

  register(agent: Agent): void {
    this.agents.set(agent.info.name, agent)
  }

  list(opts?: { includeHidden?: boolean }): Agent[] {
    const all = Array.from(this.agents.values())
    if (!opts?.includeHidden) {
      return all.filter((a) => !a.info.hidden)
    }
    return all
  }

  unregister(id: string): void {
    this.agents.delete(id)
  }
}

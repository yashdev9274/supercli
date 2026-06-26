import { describe, test, expect } from "bun:test"
import { DefaultAgentService } from "../agent-service"
import { registerBuiltInAgents } from "../built-in"

describe("AgentService", () => {
  const service = new DefaultAgentService()
  registerBuiltInAgents(service)

  test("get('plan') returns plan agent", () => {
    const agent = service.get("plan")
    expect(agent).toBeDefined()
    expect(agent!.info.name).toBe("plan")
    expect(agent!.info.mode).toBe("primary")
  })

  test("list() excludes hidden agents", () => {
    const agents = service.list()
    expect(agents.length).toBe(4)
    expect(agents.find((a) => a.info.hidden)).toBeUndefined()
  })

  test("list({ includeHidden: true }) includes all 7", () => {
    const agents = service.list({ includeHidden: true })
    expect(agents.length).toBe(7)
  })

  test("plan agent denies write_file", () => {
    const agent = service.get("plan")
    const writeRule = agent!.info.permission.find(
      (r) => r.permission === "write_file",
    )
    expect(writeRule?.action).toBe("deny")
  })

  test("build agent allows all tools", () => {
    const agent = service.get("build")
    const catchAll = agent!.info.permission.find(
      (r) => r.permission === "*" && r.pattern === "*",
    )
    expect(catchAll?.action).toBe("allow")
  })

  test("explore agent is subagent mode", () => {
    const agent = service.get("explore")
    expect(agent!.info.mode).toBe("subagent")
  })

  test("compaction agent is hidden", () => {
    const agent = service.get("compaction")
    expect(agent!.info.hidden).toBe(true)
  })

  test("get('nonexistent') returns undefined", () => {
    expect(service.get("nonexistent")).toBeUndefined()
  })

  test("register + unregister removes agent", () => {
    service.register({
      info: {
        name: "test-agent",
        mode: "primary",
        options: {},
        permission: [{ permission: "*", pattern: "*", action: "allow" }],
      },
    })
    expect(service.get("test-agent")).toBeDefined()
    service.unregister("test-agent")
    expect(service.get("test-agent")).toBeUndefined()
  })
})

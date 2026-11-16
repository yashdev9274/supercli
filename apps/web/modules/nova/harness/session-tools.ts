import { canonicalSchemas, executeTaskGraph, validateArguments } from "@super/agent-runtime"
import { streamOriginalHarness, type BridgeInput } from "./bridge"
import type { HarnessChatTool } from "./client"
import { stableHash } from "./durable"
import type { SubagentEvent } from "./subagent-events"

export type SessionAdapters = {
  saveState?: (key: string, value: unknown) => Promise<void>
  childTransport?: (signal?: AbortSignal) => Promise<NonNullable<BridgeInput["chatTransport"]>>
  unattended?: boolean
  onSubagentEvent?: (event: SubagentEvent) => Promise<void>
}

/** Each factory owns its counters and state; no CLI globals or host filesystem. */
export function createNovaSessionTools(input: BridgeInput, adapters: SessionAdapters = {}) {
  let childCount = 0
  const childTransports = new Set<NonNullable<BridgeInput["chatTransport"]>>()
  const canDelegate = (!input.chatTransport || Boolean(adapters.childTransport))
    && (!input.journal || typeof input.journal.fork === "function")
  const names = ["todowrite", "skill", ...(input.journal ? ["question"] : []), ...(canDelegate ? ["delegate", "task"] : [])]
  const schemas: HarnessChatTool[] = names.map((name) => {
    const schema = canonicalSchemas[name]!
    if (!input.journal || !["delegate", "task"].includes(name)) return schema
    return { ...schema, function: { ...schema.function, description: "Run focused read-only explore investigations with isolated context. Only agent=explore is permitted; general children are unavailable. Up to eight children per turn, with at most three parallel read workers. Return concise factual summaries." } }
  })
  const prepare = (items: Record<string, unknown>[]) => {
    if (input.journal && typeof input.journal.fork !== "function") throw new Error("Independent durable child journal unavailable")
    if (input.chatTransport && !adapters.childTransport) throw new Error("Independent child inference adapter unavailable")
    if (input.journal && items.some((item) => item.agent === "general")) throw new Error("Durable delegation permits only read-only explore children")
    if (items.some((item) => String(item.task).length > 32_000)) throw new Error("Child prompt exceeds limits")
    const context = input.journal?.delegation
    const offset = context?.offset ?? childCount
    if (offset + items.length > 8) throw new Error("Per-turn child budget exhausted")
    childCount = offset + items.length
    return items.map((item, index) => {
      const slot = offset + index + 1
      const key = `${context?.key ?? "turn"}:${slot}`
      const base: Omit<SubagentEvent, "status" | "timestamp" | "message"> = {
        type: "subagent", childId: `child-${stableHash(key).slice(0, 32)}`, index: slot,
        title: String(item.task).slice(0, 160) || `Child ${slot}`,
        prompt: String(item.task).slice(0, 32_000), agent: item.agent === "general" ? "general" : "explore",
        provider: input.provider.slice(0, 200), model: input.model.slice(0, 200),
      }
      let terminal = false
      const emit = async (status: SubagentEvent["status"], message?: string) => {
        if (terminal) return
        if (["done", "failed", "cancelled"].includes(status)) terminal = true
        await adapters.onSubagentEvent?.({ ...base, status, timestamp: new Date().toISOString(), ...(message ? { message: message.slice(0, 24_000) } : {}) })
      }
      return { item, key, slot, emit, get terminal() { return terminal } }
    })
  }
  const child = async (prepared: ReturnType<typeof prepare>[number], signal?: AbortSignal) => {
    const { item, key, slot, emit } = prepared
    try {
      signal?.throwIfAborted()
      await emit("working", "Reading and investigating")
      const mode = item.agent === "general" ? input.mode : "plan"
      const requested = Array.isArray(item.tools) ? new Set(item.tools) : undefined
      const tools = input.tools.filter((tool) => !names.includes(tool.function.name) && !["question", "switch_to_agent_mode"].includes(tool.function.name)
        && (!requested || requested.has(tool.function.name)) && (mode === "agent" || tool.access === "read"))
      let summary = ""
      let activities = 0
      let lastActivity = ""
      const chatTransport = adapters.childTransport ? await adapters.childTransport(signal) : undefined
      if (chatTransport && chatTransport === input.chatTransport) throw new Error("Child transport must be independent of its parent")
      if (chatTransport && childTransports.has(chatTransport)) throw new Error("Child transports must not share continuation state")
      if (chatTransport) childTransports.add(chatTransport)
      // Child calls are another invocation of the original CLI harness, not a web loop.
      for await (const event of streamOriginalHarness({
        ...input, mode, tools, signal,
        journal: input.journal?.fork(key),
        budget: Math.min(30, Math.max(1, Number(item.budget ?? 6))),
        chatTransport,
        messages: [{ role: "user", content: String(item.task) }],
      })) {
        if (event.type === "text") summary += event.content
        if (event.type === "error") throw new Error("Child inference failed")
        if (event.type === "tool-call" || event.type === "tool-result") {
          const activity = event.type === "tool-call" ? `Using ${event.toolName.slice(0, 160)}` : `${event.toolName.slice(0, 160)} ${event.status}`
          if (activities < 8 && activity !== lastActivity) {
            activities++
            lastActivity = activity
            await emit("working", activity)
          }
        }
        if (event.type === "finish" && !["stop", "completed", "end_turn"].includes(event.reason ?? "stop")) {
          throw new Error(`Child stopped before completing (${event.reason})`)
        }
        if (summary.length > 24_000) throw new Error("Child summary exceeded its budget")
      }
      const result = { success: true, childId: slot, agent: item.agent ?? "explore", summary }
      await adapters.saveState?.(`child-${slot}`, result)
      await emit("done", summary || "Investigation completed")
      return result
    } catch (error) {
      await emit(signal?.aborted ? "cancelled" : "failed", signal?.aborted ? "Child cancelled" : "Child investigation failed")
      throw error
    }
  }
  const runChildren = async (items: Record<string, unknown>[], parallel: boolean, signal?: AbortSignal) => {
    const children = prepare(items)
    for (const prepared of children) await prepared.emit("queued")
    try {
      return await executeTaskGraph(children.map((prepared) => ({
        readOnly: prepared.item.agent !== "general",
        run: (childSignal) => child(prepared, childSignal),
      })), parallel, signal)
    } finally {
      for (const prepared of children) {
        if (!prepared.terminal) await prepared.emit("cancelled", "Child cancelled before execution")
      }
    }
  }
  return {
    tools: schemas.map((schema) => ({ ...schema, access: "state" as const })),
    async execute(name: string, raw: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
      signal?.throwIfAborted()
      const args = validateArguments(canonicalSchemas[name]!.function.parameters, raw) as Record<string, unknown>
      if (name === "todowrite") {
        const todos = args.todos as Array<{ status: string }>
        if (todos.length > 100 || todos.filter((todo) => todo.status === "in_progress").length > 1) throw new Error("Invalid TODO state")
        await adapters.saveState?.("todos", todos)
        return { success: true, todos: structuredClone(todos) }
      }
      if (name === "delegate") return (await runChildren([args], false, signal))[0]
      if (name === "task") {
        const items = args.items as Record<string, unknown>[]
        if (items.length > 8) throw new Error("At most eight child tasks per turn")
        const results = await runChildren(items, args.parallel === true, signal)
        const parallel = args.parallel === true && items.some((item, index) =>
          index > 0 && item.agent !== "general" && items[index - 1]?.agent !== "general")
        return { success: true, results, parallel }
      }
      if (name === "skill") {
        if (!input.tools.some((tool) => tool.function.name === "read_file")) return { success: false, error: "Skills require an authorized workspace" }
        if (["install", "remove"].includes(String(args.action))) return { success: false, denied: true, error: "Skill installation/removal requires an explicit workspace edit; no global skill store is available" }
        if (args.action === "list") return { success: true, instructions: "Use search_files to locate workspace SKILL.md files, then load a selected skill by workspace-relative path." }
        const name = String(args.name ?? "")
        if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error("Invalid workspace skill name")
        return input.execute("read_file", { path: `.agents/skills/${name}/SKILL.md`, startLine: 1, maxLines: 300 }, signal)
      }
      throw new Error("Unsupported session capability")
    },
  }
}

import { canonicalSchemas, validateArguments } from "@super/agent-runtime"
import { streamOriginalHarness, type BridgeInput } from "./bridge"
import type { HarnessChatTool } from "./client"

export type SessionAdapters = {
  saveState?: (key: string, value: unknown) => Promise<void>
  childTransport?: () => Promise<NonNullable<BridgeInput["chatTransport"]>>
  unattended?: boolean
}

/** Each factory owns its counters and state; no CLI globals or host filesystem. */
export function createNovaSessionTools(input: BridgeInput, adapters: SessionAdapters = {}) {
  let childCount = 0
  const names = ["todowrite", "skill", ...(input.journal ? ["question"] : ["delegate", "task"])]
  const schemas: HarnessChatTool[] = names.map((name) => canonicalSchemas[name]!)
  const child = async (item: Record<string, unknown>, signal?: AbortSignal) => {
    signal?.throwIfAborted()
    const childId = ++childCount
    if (childId > 8) throw new Error("Per-turn child budget exhausted")
    // Never share a stateful Codex/Responses continuation with a child.
    if (input.chatTransport && !adapters.childTransport) throw new Error("Independent child inference adapter unavailable")
    const mode = item.agent === "general" ? input.mode : "plan"
    const requested = Array.isArray(item.tools) ? new Set(item.tools) : undefined
    const tools = input.tools.filter((tool) => !names.includes(tool.function.name) && !["question", "switch_to_agent_mode"].includes(tool.function.name)
      && (!requested || requested.has(tool.function.name)) && (mode === "agent" || tool.access === "read"))
    let summary = ""
    // Child calls are another invocation of the original CLI harness, not a web loop.
    for await (const event of streamOriginalHarness({
      ...input, mode, tools, signal,
      budget: Math.min(30, Math.max(1, Number(item.budget ?? 6))),
      chatTransport: adapters.childTransport ? await adapters.childTransport() : undefined,
      messages: [{ role: "user", content: String(item.task) }],
    })) {
      if (event.type === "text") summary += event.content
      if (summary.length > 24_000) throw new Error("Child summary exceeded its budget")
    }
    const result = { success: true, childId, agent: item.agent ?? "explore", summary }
    await adapters.saveState?.(`child-${childId}`, result)
    return result
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
      if (name === "delegate") return child(args, signal)
      if (name === "task") {
        const items = args.items as Record<string, unknown>[]
        if (items.length > 8) throw new Error("At most eight child tasks per turn")
        const results: unknown[] = []
        // Sequential children avoid concurrent writes to the same workspace.
        for (const item of items) results.push(await child(item, signal))
        return { success: true, results, parallel: false }
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

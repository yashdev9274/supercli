import { z } from "zod"
import type { LanguageModel, ToolSet } from "ai"
import { agentService, loadPrompt } from "src/agent/index.ts"
import type { GenerateOptions, GenerateResult } from "src/agent/agent.ts"
import { writeScratch } from "src/lib/scratch.ts"

const delegateSchema = z.object({
  task: z
    .string()
    .describe(
      "Self-contained subtask for the subagent. Must include all context " +
        "the subagent needs (file paths, expected output, constraints).",
    ),
  agent: z
    .enum(["explore", "general"])
    .optional()
    .default("explore")
    .describe(
      "Which subagent to spawn. 'explore' is read-only and fastest; " +
        "'general' can write files but uses more tokens.",
    ),
  tools: z
    .array(z.string())
    .optional()
    .describe(
      "Whitelist of tool names the subagent may use. The subagent's own " +
        "permission ruleset still applies (e.g. explore denies write_file " +
        "even if you list it). Default for explore: read-only tools. " +
        "Default for general: all tools.",
    ),
  budget: z
    .number()
    .int()
    .min(1)
    .max(30)
    .optional()
    .describe("Override the subagent's step budget (default: agent.info.steps)."),
})

export type DelegateArgs = z.infer<typeof delegateSchema>

const READ_ONLY_TOOLS = new Set([
  "read_file",
  "search_files",
  "read_instructions",
  "url_fetch",
  "web_search",
  "task",
])

//
// Module-scoped context, set by the chat loop before each turn.
// Keeps the tool signature simple (`execute(args)`) without forcing every
// provider to thread a context object through the AI SDK.
//
interface DelegateRuntime {
  model: LanguageModel | null
  allTools: Record<string, unknown>
  onChunk?: (chunk: string) => void
  onToolCall?: (params: { toolName: string; args?: unknown }) => void
  onReasoning?: (chunk: string) => void
}

let runtime: DelegateRuntime = {
  model: null,
  allTools: {},
}

export function setDelegateRuntime(rt: Partial<DelegateRuntime>) {
  runtime = { ...runtime, ...rt }
}

function filterTools(
  requested: string[] | undefined,
  agentName: string,
): ToolSet | undefined {
  const defaults =
    agentName === "general"
      ? undefined // use everything
      : Array.from(READ_ONLY_TOOLS)

  const wanted = new Set(requested ?? defaults ?? Object.keys(runtime.allTools))
  const tools: ToolSet = {}
  for (const name of wanted) {
    if (runtime.allTools[name]) {
      tools[name] = runtime.allTools[name] as any
    }
  }
  return Object.keys(tools).length > 0 ? tools : undefined
}

export const delegateTool = {
  description:
    "Delegate a self-contained subtask to a focused subagent. " +
    "Use this when the user's request has a clearly separable subproblem " +
    "(e.g. 'summarize this URL', 'find all files matching X', 'extract the API surface'). " +
    "The subagent runs with its own context and tool budget, then returns a concise structured summary. " +
    "Prefer delegating over chaining many tool calls in the parent — keeps the parent's context clean. " +
    "Set `agent: 'general'` for write access (will still ask for permission on destructive operations). " +
    "Set `agent: 'explore'` (default) for fast read-only investigation.",
  parameters: delegateSchema,
  execute: async (args: DelegateArgs) => {
    if (!runtime.model) {
      return JSON.stringify({
        success: false,
        error: "delegate: no model available in this session",
      })
    }

    const agent = agentService.get(args.agent)
    if (!agent) {
      return JSON.stringify({
        success: false,
        error: `delegate: agent '${args.agent}' not registered`,
      })
    }

    const tools = filterTools(args.tools, args.agent)

    const generateOpts: GenerateOptions = {
      model: runtime.model,
      tools,
      prompt: args.task,
      budget: args.budget ?? agent.info.steps,
      onChunk: runtime.onChunk,
      onToolCall: runtime.onToolCall,
    }

    try {
      const result: GenerateResult = await agent.generate!(generateOpts)

      // Persist structured artifacts for the parent's follow-up
      const scratchName = `delegate-${args.agent}-${Date.now()}`
      const scratchPath = await writeScratch(scratchName, {
        task: args.task,
        agent: args.agent,
        result,
      })

      return JSON.stringify({
        success: !result.error,
        agent: args.agent,
        summary: result.text,
        scratchPath,
        artifacts: {
          filesRead: result.filesRead ?? [],
          filesChanged: result.filesChanged ?? [],
          tokens: result.tokens,
          finishReason: result.finishReason,
        },
        error: result.error,
      })
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error?.message ?? String(error),
      })
    }
  },
}

//
// `task` tool — the parallel-friendly sibling of `delegate`. Accepts an
// array of subtasks, runs them concurrently via Promise.all, and returns a
// combined summary. This is what the parent agent should reach for when it
// has 2+ independent lookups.
//
const taskItemSchema = z.object({
  task: z.string().describe("Self-contained subtask"),
  agent: z.enum(["explore", "general"]).optional().default("explore"),
  tools: z.array(z.string()).optional(),
  budget: z.number().int().min(1).max(30).optional(),
})

const taskSchema = z.object({
  items: z
    .array(taskItemSchema)
    .min(1)
    .describe("Subtasks to run. Each is independent and runs concurrently."),
  parallel: z
    .boolean()
    .optional()
    .default(false)
    .describe(
      "Set true to run all items in parallel via Promise.all. Default: " +
        "false (sequential, in order).",
    ),
})

export type TaskArgs = z.infer<typeof taskSchema>

export const taskTool = {
  description:
    "Run one or more focused subtasks against subagents. When `parallel: true`, " +
    "all items run concurrently and you get a combined summary. Use this for " +
    "investigation/research tasks where you'd otherwise have to call `delegate` " +
    "3+ times in a row. Default is sequential (in order) so callers can rely on " +
    "deterministic ordering when they need it.",
  parameters: taskSchema,
  execute: async (args: TaskArgs) => {
    if (!runtime.model) {
      return JSON.stringify({
        success: false,
        error: "task: no model available in this session",
      })
    }

    const MAX_PARALLEL = 3
    const items = args.items.slice(0, 8) // hard cap to avoid runaway token usage
    const isParallel = args.parallel && items.length > 1

    const runOne = async (item: z.infer<typeof taskItemSchema>, idx: number) => {
      const agent = agentService.get(item.agent)
      if (!agent) {
        return {
          index: idx,
          success: false,
          error: `task: agent '${item.agent}' not registered`,
        }
      }
      const tools = filterTools(item.tools, item.agent)
      try {
        const result = await agent.generate!({
          model: runtime.model!,
          tools,
          prompt: item.task,
          budget: item.budget ?? agent.info.steps,
          onChunk: runtime.onChunk,
          onToolCall: runtime.onToolCall,
        })
        return {
          index: idx,
          agent: item.agent,
          success: !result.error,
          summary: result.text,
          filesRead: result.filesRead ?? [],
          filesChanged: result.filesChanged ?? [],
          tokens: result.tokens,
          error: result.error,
        }
      } catch (error: any) {
        return {
          index: idx,
          agent: item.agent,
          success: false,
          error: error?.message ?? String(error),
        }
      }
    }

    const results = isParallel
      ? await Promise.all(items.map((it, i) => runOne(it, i)))
      : (await Promise.all(
          items.map(async (it, i) => {
            if (i > 0 && i >= MAX_PARALLEL) {
              // soft cap on sequential runs — first MAX_PARALLEL only
              return null
            }
            return runOne(it, i)
          }),
        )).filter((r): r is NonNullable<typeof r> => r !== null)

    const scratchName = `task-${Date.now()}`
    const scratchPath = await writeScratch(scratchName, {
      parallel: isParallel,
      results,
    })

    // Compose a summary string the parent can read directly
    const lines = results.map(
      (r) =>
        `[${r.index}] (${r.agent}) ${r.success ? "✓" : "✗"} ${
          r.summary ?? r.error ?? "(no output)"
        }`,
    )

    return JSON.stringify({
      success: results.every((r) => r.success),
      parallel: isParallel,
      summaries: lines.join("\n"),
      scratchPath,
      results,
    })
  },
}
import { z } from "zod"
import { streamText, stepCountIs, type LanguageModel } from "ai"
import chalk from "chalk"

const delegateSchema = z.object({
  task: z
    .string()
    .describe(
      "Self-contained subtask for the subagent. Must include all context " +
        "the subagent needs (file paths, expected output, constraints).",
    ),
  tools: z
    .array(z.string())
    .optional()
    .describe(
      "Whitelist of tool names the subagent may use. Default: read-only " +
        "(read_file, search_files, read_instructions, url_fetch, web_search). " +
        "Pass names like 'write_file', 'run_command', 'code_exec' to grant write access.",
    ),
})

export type DelegateArgs = z.infer<typeof delegateSchema>

const READ_ONLY_TOOLS = new Set([
  "read_file",
  "search_files",
  "read_instructions",
  "url_fetch",
  "web_search",
])

const TOOL_BRIEF: Record<string, string> = {
  read_file: "read a file by relative path",
  search_files: "find files by glob/regex pattern",
  read_instructions: "read project-specific instructions",
  url_fetch: "fetch and extract text from a URL",
  web_search: "search the web",
  write_file: "write or overwrite a file (destructive)",
  run_command: "run a shell command (use sparingly, side effects)",
  code_exec: "execute a small JS/TS snippet (sandboxed)",
}

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

export const delegateTool = {
  description:
    "Delegate a self-contained subtask to a focused subagent. " +
    "Use this when the user's request has a clearly separable subproblem " +
    "(e.g. 'summarize this URL', 'find all files matching X', 'extract the API surface'). " +
    "The subagent runs with its own context and tool budget, then returns a concise summary. " +
    "Prefer delegating over chaining many tool calls in the parent — keeps the parent's context clean.",
  parameters: delegateSchema,
  execute: async (args: DelegateArgs) => {
    if (!runtime.model) {
      return JSON.stringify({
        success: false,
        error: "delegate: no model available in this session",
      })
    }

    const requested = args.tools ?? Array.from(READ_ONLY_TOOLS)
    const subagentTools: Record<string, any> = {}
    for (const name of requested) {
      if (runtime.allTools[name]) {
        subagentTools[name] = runtime.allTools[name] as any
      }
    }

    const toolList = requested
      .map((n) => `- ${n}: ${TOOL_BRIEF[n] ?? "(no description)"}`)
      .join("\n")

    const subagentSystem = [
      "You are a focused subagent. Complete the assigned task and return a concise summary.",
      "",
      "Constraints:",
      `- You may only use these tools: ${requested.join(", ") || "(none)"}`,
      "- Maximum 6 tool calls. Stop calling tools once you have enough information.",
      "- Do not ask clarifying questions — work with the information given.",
      "- Return a structured summary the parent agent can use directly.",
      "",
      "Available tools:",
      toolList,
    ].join("\n")

    try {
      const budget = 6
      let fullResponse = ""
      const result = streamText({
        model: runtime.model,
        system: subagentSystem,
        messages: [{ role: "user", content: args.task }],
        tools: Object.keys(subagentTools).length > 0 ? subagentTools : undefined,
        stopWhen: stepCountIs(budget),
        onStepFinish: async (event: any) => {
          if (event.toolCalls?.length) {
            for (const tc of event.toolCalls) {
              runtime.onToolCall?.({
                toolName: tc.toolName,
                args: (tc as any).input,
              })
            }
          }
        },
      })

      for await (const chunk of result.textStream) {
        fullResponse += chunk
        runtime.onChunk?.(chunk)
      }

      const usage = await result.usage
      return JSON.stringify({
        success: true,
        summary: fullResponse,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        toolsAvailable: Object.keys(subagentTools),
      })
    } catch (error: any) {
      return JSON.stringify({
        success: false,
        error: error?.message ?? String(error),
      })
    }
  },
}
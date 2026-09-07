import { stepCountIs, streamText, type ToolSet } from "ai"
import type { Agent, GenerateOptions, GenerateResult, Harness, ToolMeta } from "./types.ts"
import { loadInstructions } from "./discover.ts"
import { isEmptyToolResult, summarizeToolResult } from "src/cli/ai/tool-result"
import {
  setCurrentAgent,
  getCurrentAgent,
  setParentAgent,
  getParentAgent,
  permissionManager,
} from "./approval.ts"
import { DESTRUCTIVE_TOOLS, READ_TOOLS } from "../sandbox/policy.ts"
import { emitHook } from "../hooks/index.ts"
import {
  stripControlTokens,
  extractEmbeddedToolCalls,
} from "src/lib/embedded-tool-calls.ts"
import {
  createThinkSplitter,
  finalizeAnswerVsProcess,
} from "src/runtime/stream/split-think-content.ts"

const DEFAULT_SUBAGENT_BUDGET = 6
const DEFAULT_PRIMARY_BUDGET = 50

interface StepEvent {
  toolCalls?: Array<{ toolName: string; input?: unknown }>
  toolResults?: Array<{ toolName?: string; input?: unknown; output?: unknown }>
  text?: string
  finishReason?: string
}

export async function runAgent(
  agent: Agent,
  opts: GenerateOptions,
): Promise<GenerateResult> {
  const budget =
    opts.budget ??
    agent.info.steps ??
    (agent.info.mode === "primary" ? DEFAULT_PRIMARY_BUDGET : DEFAULT_SUBAGENT_BUDGET)

  let systemPrompt: string | undefined = opts.system
  if (!systemPrompt && agent.info.prompt) {
    systemPrompt = await loadInstructions(agent.info.prompt)
  }
  if (!systemPrompt && agent.resolvePrompt) {
    systemPrompt = agent.resolvePrompt(opts.system)
  }

  // Soften monologue-y control markup left in system if any
  if (systemPrompt) {
    systemPrompt = stripControlTokens(systemPrompt) || systemPrompt
  }

  const tools: ToolSet | undefined = opts.tools
    ? wrapToolsWithAgent(agent, opts.tools, opts.parentAgent)
    : undefined

  const filesRead = new Set<string>()
  const filesChanged = new Set<string>()
  let fullText = ""
  let fullReasoning = ""
  const thinkSplit = createThinkSplitter()
  let fullToolCalls: Array<{ toolName: string; args?: unknown }> = []
  let inputTokens = 0
  let outputTokens = 0

  const seenStepResults: Array<{ toolName: string; result: string }> = []
  const toolCallHistory: Array<{ toolName: string; argsKey: string }> = []
  let stopForRepetition = false
  let lastStepHadToolCalls = false
  let lastStepHadActionClaim = false

  const messages = buildMessages(opts)

  await emitHook({ type: "turn_start", agent: agent.info.name })
  opts.onStatus?.("running")

  const pushTextDelta = (raw: string) => {
    if (!raw) return
    const parts = thinkSplit.push(raw)
    if (parts.reasoning) {
      fullReasoning += parts.reasoning
      opts.onReasoning?.(parts.reasoning)
    }
    if (parts.text) {
      fullText += parts.text
      opts.onChunk?.(parts.text)
    }
  }

  const pushReasoningDelta = (raw: string) => {
    if (!raw) return
    fullReasoning += raw
    opts.onReasoning?.(raw)
  }

  try {
    const result = streamText({
      model: opts.model,
      system: systemPrompt,
      messages,
      tools,
      stopWhen: stepCountIs(budget),
      abortSignal: opts.signal,
      onChunk: async ({ chunk }) => {
        const c = chunk as { type: string; text?: string; delta?: string }
        if (c.type === "text-delta" && typeof c.text === "string") {
          pushTextDelta(c.text)
          return
        }
        // AI SDK reasoning channel variants
        if (
          (c.type === "reasoning" ||
            c.type === "reasoning-delta" ||
            c.type === "reasoning-part") &&
          typeof (c.text ?? c.delta) === "string"
        ) {
          pushReasoningDelta((c.text ?? c.delta) as string)
        }
      },
      prepareStep: async () => {
        if (opts.signal?.aborted) return undefined
        if (stopForRepetition) {
          return {
            messages: [
              {
                role: "system" as const,
                content:
                  "SYSTEM NOTICE: You have called the same tools with the same arguments " +
                  "multiple times without making progress. Stop repeating yourself. " +
                  "Analyze what you already know and respond to the user.",
              },
            ],
          }
        }
        if (lastStepHadActionClaim) {
          lastStepHadActionClaim = false
          return {
            messages: [
              {
                role: "system" as const,
                content:
                  "SYSTEM NOTICE: Your previous response claimed to have made changes " +
                  "(e.g., wrote, edited, refactored) but you did not call any tools. " +
                  "Do not describe changes — actually execute them by calling the appropriate " +
                  "tool (edit_file, write_file, run_command, etc.). Then summarize what you did.",
              },
            ],
          }
        }
        if (seenStepResults.length === 0) return undefined
        const allEmpty = seenStepResults.every((r) => isEmptyToolResult(r.result))
        if (!allEmpty) return undefined
        const summary = seenStepResults
          .map((r) => `- ${r.toolName}: ${summarizeToolResult(r.result)}`)
          .join("\n")
        return {
          messages: [
            ...messages,
            {
              role: "system" as const,
              content:
                "SYSTEM NOTICE: All tool calls in the previous step returned empty or error results. " +
                "You have NO source material to work with. Do NOT fabricate data, assume defaults, " +
                "or proceed with guesswork. Re-check your inputs and retry with different parameters, " +
                "or tell the user which tools failed.\n\nTool outcomes:\n" +
                summary,
            },
          ],
        }
      },
      onStepFinish: async (event: StepEvent) => {
        if (event.text) fullText += event.text
        if (event.toolCalls?.length) {
          for (const tc of event.toolCalls) {
            const toolName = tc.toolName
            fullToolCalls.push({ toolName, args: tc.input })
            opts.onToolCall?.({ toolName, args: tc.input })
            await emitHook({
              type: "tool_start",
              agent: agent.info.name,
              toolName,
              args: tc.input,
            })

            const args = (tc.input ?? {}) as Record<string, unknown>
            if (READ_TOOLS.has(toolName) && typeof args.path === "string") {
              filesRead.add(args.path)
            }
            if (DESTRUCTIVE_TOOLS.has(toolName)) {
              const target =
                typeof args.path === "string"
                  ? args.path
                  : typeof args.command === "string"
                    ? args.command.slice(0, 80)
                    : typeof args.code === "string"
                      ? args.code.slice(0, 80)
                      : "(unknown)"
              filesChanged.add(target)
            }
          }
        }

        seenStepResults.length = 0
        if (event.toolResults?.length) {
          for (const tr of event.toolResults) {
            const name = tr.toolName ?? "unknown"
            const out = (tr as any).output
            const text =
              typeof out === "string"
                ? out
                : out === undefined || out === null
                  ? ""
                  : JSON.stringify(out)
            seenStepResults.push({ toolName: name, result: text })
            opts.onToolResult?.({ toolName: name, result: out })
            await emitHook({
              type: "tool_end",
              agent: agent.info.name,
              toolName: name,
              result: out,
            })
          }
        }

        if (event.toolCalls?.length) {
          for (const tc of event.toolCalls) {
            const args = tc.input ?? {}
            const argsKey = JSON.stringify(args)
            toolCallHistory.push({ toolName: tc.toolName, argsKey })
            let count = 0
            for (const h of toolCallHistory) {
              if (h.toolName === tc.toolName && h.argsKey === argsKey) count++
            }
            if (count >= 3) {
              stopForRepetition = true
              break
            }
          }
          if (toolCallHistory.length > 12) {
            toolCallHistory.splice(0, toolCallHistory.length - 12)
          }
        }

        lastStepHadToolCalls = (event.toolCalls?.length ?? 0) > 0
        lastStepHadActionClaim = false
        if (!lastStepHadToolCalls && event.text) {
          const actionClaimRe =
            /\b(wrote|updated|added|created|ran|executed|fixed|refactored|removed|deleted|installed|modified|edited|applied|saved|generated|wired|hooked)\b/i
          lastStepHadActionClaim = actionClaimRe.test(event.text)
        }
        opts.onStepFinish?.(event)
        await emitHook({
          type: "step_finish",
          agent: agent.info.name,
          step: event,
        })
      },
    })

    await result.consumeStream()

    const flushed = thinkSplit.flush()
    if (flushed.reasoning) {
      fullReasoning += flushed.reasoning
      opts.onReasoning?.(flushed.reasoning)
    }
    if (flushed.text) {
      fullText += flushed.text
      opts.onChunk?.(flushed.text)
    }

    const usage = await result.usage
    inputTokens = usage?.inputTokens ?? 0
    outputTokens = usage?.outputTokens ?? 0
    const finishReason = await result.finishReason

    // Recover DSML/embedded tool calls from monologue text if the model
    // wrote invoke markup instead of structured tool_calls.
    if (fullToolCalls.length === 0 && fullText) {
      const recovered = extractEmbeddedToolCalls(fullText)
      if (recovered.calls.length > 0) {
        for (const tc of recovered.calls) {
          fullToolCalls.push({ toolName: tc.name, args: tc.args })
        }
        fullText = recovered.text || fullText
      } else {
        fullText = stripControlTokens(fullText) || fullText
      }
    }

    // End-of-turn gate: untagged CoT / process scratch never lands in Result.
    const final = finalizeAnswerVsProcess(fullText, fullReasoning)
    if (final.reasoning && final.reasoning !== fullReasoning) {
      const extra = final.reasoning.slice(fullReasoning.length).trim()
      if (extra) opts.onReasoning?.(extra)
    }
    fullText = final.text
    fullReasoning = final.reasoning || fullReasoning

    const out: GenerateResult = {
      text: fullText,
      reasoning: fullReasoning || undefined,
      toolCalls: fullToolCalls,
      finishReason: typeof finishReason === "string" ? finishReason : undefined,
      tokens: { input: inputTokens, output: outputTokens },
      filesRead: Array.from(filesRead),
      filesChanged: Array.from(filesChanged),
    }
    await emitHook({
      type: "turn_end",
      agent: agent.info.name,
      text: out.text,
    })
    opts.onStatus?.("finished")
    return out
  } catch (error: any) {
    const flushed = thinkSplit.flush()
    if (flushed.reasoning) fullReasoning += flushed.reasoning
    if (flushed.text) fullText += flushed.text
    const final = finalizeAnswerVsProcess(fullText, fullReasoning)
    fullText = final.text
    fullReasoning = final.reasoning || fullReasoning

    const out: GenerateResult = {
      text: fullText,
      reasoning: fullReasoning || undefined,
      toolCalls: fullToolCalls,
      finishReason: "error",
      tokens: { input: inputTokens, output: outputTokens },
      filesRead: Array.from(filesRead),
      filesChanged: Array.from(filesChanged),
      error: error?.message ?? String(error),
    }
    await emitHook({
      type: "turn_end",
      agent: agent.info.name,
      text: out.text,
      error: out.error,
    })
    return out
  }
}

function buildMessages(
  opts: GenerateOptions,
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  if (opts.messages?.length) return opts.messages
  if (opts.prompt) return [{ role: "user", content: opts.prompt }]
  return []
}

function wrapToolsWithAgent(
  agent: Agent,
  tools: Record<string, unknown>,
  parentAgentName?: string,
): ToolSet {
  const wrapped: ToolSet = {}
  for (const [name, t] of Object.entries(tools)) {
    const tt = t as { execute?: (...args: any[]) => any; description?: string }
    if (!tt.execute) {
      wrapped[name] = t as any
      continue
    }
    const originalExecute = tt.execute
    wrapped[name] = {
      ...(tt as any),
      execute: async (input: any, execOptions: any) => {
        const previous = getCurrentAgent()
        const previousParent = getParentAgent()
        setCurrentAgent(agent.info.name)
        setParentAgent(parentAgentName)
        try {
          const args = typeof input === "object" && input !== null ? input : {}
          const allowed = await permissionManager.check(
            name,
            args as Record<string, unknown>,
          )
          if (!allowed) {
            return JSON.stringify({
              success: false,
              cancelled: true,
              reason: `Permission denied by ${agent.info.name} ruleset`,
            })
          }
          return await originalExecute(input, execOptions)
        } finally {
          setCurrentAgent(previous)
          setParentAgent(previousParent)
        }
      },
    }
  }
  return wrapped
}

export interface CreateHarnessOptions {
  agents: Map<string, Agent>
  loadTools: () => Record<string, unknown> | Promise<Record<string, unknown>>
  getToolMeta: () => Record<string, ToolMeta> | Promise<Record<string, ToolMeta>>
  defaultAgent?: string
}

export function createHarness(opts: CreateHarnessOptions): Harness {
  const defaultAgent = opts.defaultAgent ?? "build"

  return {
    async runTurn(turnOpts) {
      const id = turnOpts.agent ?? defaultAgent
      const agent = opts.agents.get(id)
      if (!agent) {
        return {
          text: "",
          error: `agent '${id}' not registered`,
          finishReason: "error",
        }
      }
      const tools =
        turnOpts.tools ??
        (await Promise.resolve(opts.loadTools()))
      return runAgent(agent, { ...turnOpts, tools })
    },
    getAgent(id) {
      return opts.agents.get(id)
    },
    listAgents(listOpts) {
      let all = Array.from(opts.agents.values())
      if (!listOpts?.includeHidden) {
        all = all.filter((a) => !a.info.hidden)
      }
      if (listOpts?.mode) {
        all = all.filter(
          (a) => a.info.mode === listOpts.mode || a.info.mode === "all",
        )
      }
      return all
    },
    loadTools() {
      const t = opts.loadTools()
      if (t && typeof (t as any).then === "function") {
        // sync API expects cache; callers that need fresh should await loadToolsSdk
        return {}
      }
      return t as Record<string, unknown>
    },
    getToolMeta() {
      const m = opts.getToolMeta()
      if (m && typeof (m as any).then === "function") return {}
      return m as Record<string, ToolMeta>
    },
  }
}

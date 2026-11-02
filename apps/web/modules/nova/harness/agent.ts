import { canonicalAccess, classifyComposioTool } from "@super/agent-runtime"
import { streamOriginalHarness, type BridgeInput } from "./bridge"
import { createNovaSessionTools, type SessionAdapters } from "./session-tools"
import {
  type HarnessChatMessage,
  type HarnessChatTool,
  type HarnessStreamEvent,
} from "./client"
import { requestHarnessComposio, type ComposioTool } from "./composio-client"
import { toolsAllowedForMode } from "./tool-policy"

/** Cap tools sent to the model to avoid overflowing context / provider limits. */
const MAX_TOOLS_TO_MODEL = 64

export type HarnessAgentEvent = HarnessStreamEvent | {
  type: "tool-result"
  toolName: string
  toolCallId: string
  status: "completed" | "failed" | "denied"
  message: string
}

/** Flatten multimodal / unknown content so the terminal harness never sees non-strings. */
export function flattenHarnessContent(content: HarnessChatMessage["content"]): string {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (!part || typeof part !== "object") return ""
        if ("text" in part && typeof part.text === "string") return part.text
        return ""
      })
      .filter(Boolean)
      .join("\n")
  }
  if (content == null) return ""
  try {
    return JSON.stringify(content)
  } catch {
    return ""
  }
}

function preferTools(tools: ComposioTool[], mode: string): ComposioTool[] {
  const allowed = toolsAllowedForMode(mode, tools) as ComposioTool[]
  // Prefer GitHub/Linear/Slack list+get tools first so the model actually sees them.
  const rank = (name: string) => {
    const n = name.toUpperCase()
    if (n.includes("GITHUB") && (n.includes("PULL") || n.includes("LIST") || n.includes("GET"))) return 0
    if (n.includes("LINEAR") && (n.includes("LIST") || n.includes("GET"))) return 1
    if (n.includes("SLACK") && (n.includes("LIST") || n.includes("GET"))) return 2
    if (n.includes("LIST") || n.includes("GET") || n.includes("SEARCH")) return 3
    return 5
  }
  const groups = new Map<string, ComposioTool[]>()
  for (const tool of [...allowed].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name))) {
    const group = groups.get(tool.toolkit) ?? []
    group.push(tool)
    groups.set(tool.toolkit, group)
  }
  // Round-robin prevents a large GitHub catalog from hiding all other apps.
  const ordered: ComposioTool[] = []
  for (let index = 0; ordered.length < allowed.length; index++) {
    for (const group of groups.values()) {
      if (group[index]) ordered.push(group[index]!)
    }
  }
  return ordered
}

export type ChatTransport = import("./client").DurableChatTransport

export async function* streamHarnessAgent(input: {
  chatTransport?: ChatTransport
  journal?: BridgeInput["journal"]
  checkpoint?: (input: Pick<BridgeInput, "messages" | "tools" | "provider" | "model" | "mode">) => Promise<Pick<BridgeInput, "messages" | "tools" | "provider" | "model" | "mode">>
  childTransport?: SessionAdapters["childTransport"]
  saveState?: SessionAdapters["saveState"]
  unattended?: boolean
  /** Connected app authorization is independent of inference authorization. */
  skipConnectedTools?: boolean
  token: string
  messages: HarnessChatMessage[]
  provider: string
  model: string
  signal?: AbortSignal
  /** chat = reads only; agent = reads + writes; plan = reads only */
  mode?: string
  /** Extra tools (e.g. native GitHub) always available on Nova web. */
  extraTools?: HarnessChatTool[]
  /** Cloud coding runs expose only their isolated workspace tools. */
  isolatedTools?: boolean
  executeExtraTool?: (
    toolName: string,
    args: Record<string, unknown>,
    signal?: AbortSignal,
  ) => Promise<Record<string, unknown>>
}): AsyncGenerator<HarnessAgentEvent> {
  input.signal?.throwIfAborted()
  const mode = (input.mode ?? "agent").toLowerCase()
  const catalog = input.isolatedTools || input.skipConnectedTools ? { tools: [] as ComposioTool[] } : await requestHarnessComposio<{ tools: ComposioTool[] }>("tools", input.token, {}, input.signal)
  const available = new Map(catalog.tools.map((tool) => [tool.name, tool]))
  const ranked = preferTools(catalog.tools, mode).slice(0, MAX_TOOLS_TO_MODEL)
  const composioTools: HarnessChatTool[] = ranked.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }))
  const extraTools = input.extraTools ?? []
  const tools: HarnessChatTool[] = [...extraTools, ...composioTools]
  const toolkits = [...new Set(ranked.map((tool) => tool.toolkit).filter(Boolean))]

  const messages: HarnessChatMessage[] = [
    ...input.messages.map((message): HarnessChatMessage => ({
      ...message,
      content: flattenHarnessContent(message.content),
    })),
    {
      role: "system",
      content: `Nova host context: mode=${mode}. Available toolkits: ${toolkits.join(", ") || "none"}. Native capabilities: ${extraTools.map((tool) => tool.function.name).join(", ") || "none"}.
Execution target: ${input.isolatedTools ? "isolated cloud workspace; no laptop access or publication" : "web; no local filesystem or shell unless explicitly offered"}.
Connected GitHub and native GitHub may authorize different repositories. Discover accessible repositories rather than guessing names. Public research uses server-managed providers independently of app connections; cite returned URLs. Attachments are snapshots, not shell access. Browser apply proposals require full path= file fences and explicit user application. Terminal interaction, global skill installation and automatic mode escalation are unavailable; report those limits instead of simulating them.`,
    },
  ]

  yield {
    type: "status",
    phase: "connections",
    message: `${tools.length} tools available${toolkits.length ? ` · ${toolkits.join(", ")}` : ""}${extraTools.length ? input.isolatedTools ? " · cloud workspace" : " · native tools" : ""}`,
  }

  const bridge: BridgeInput = {
    ...input,
    messages,
    mode: mode === "chat" || mode === "plan" ? mode : "agent",
    tools: tools.map((schema) => ({
      ...schema,
      access: extraTools.some((tool) => tool.function.name === schema.function.name)
        ? canonicalAccess(schema.function.name)
        : classifyComposioTool(schema.function.name, available.get(schema.function.name)?.requiresApproval) === "read" ? "read" as const : "write" as const,
    })),
    execute: async (name, args, signal) => {
      if (extraTools.some((tool) => tool.function.name === name)) {
        if (!input.executeExtraTool) throw new Error("Missing native capability adapter")
        return input.executeExtraTool(name, args, signal)
      }
      if (!available.has(name)) throw new Error("Connected tool unavailable")
      return requestHarnessComposio<Record<string, unknown>>("execute", input.token, { toolName: name, arguments: args }, signal)
    },
  }
  if (new Set(bridge.tools.map((tool) => tool.function.name)).size !== bridge.tools.length) throw new Error("Duplicate capability names")
  bridge.approvalTools = bridge.tools.filter((tool) => ["write", "execute"].includes(tool.access) && available.has(tool.function.name)).map((tool) => tool.function.name)
  const session = createNovaSessionTools(bridge, input)
  const execute = bridge.execute
  const allTools = [...bridge.tools, ...session.tools]
  const frozen = await input.checkpoint?.({ messages: bridge.messages, tools: allTools, provider: bridge.provider, model: bridge.model, mode: bridge.mode })
  if (frozen && frozen.tools.some((tool) => !allTools.some((current) => current.function.name === tool.function.name && current.access === tool.access))) throw new Error("Checkpoint capabilities are no longer available")
  yield* streamOriginalHarness({
    ...bridge,
    ...frozen,
    tools: frozen?.tools ?? allTools,
    execute: (name, args, signal) => session.tools.some((tool) => tool.function.name === name)
      ? session.execute(name, args, signal) : execute(name, args, signal),
  })
}

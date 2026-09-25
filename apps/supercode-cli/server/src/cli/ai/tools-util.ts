/**
 * Tool schema serialization for OpenAI-compatible HTTP bodies and the cloud proxy.
 *
 * AI SDK 6 tools expose Zod via `inputSchema`. Older shapes used `parameters`
 * (already JSON Schema). JSON.stringify drops Zod `_def.shape` functions, so
 * callers that forward tools over HTTP must convert here while the live Zod
 * object is still intact.
 */
import { zodToJsonSchema } from "zod-to-json-schema"

const EMPTY_OBJECT_SCHEMA = { type: "object", properties: {} } as const

export type ToolLike = {
  description?: string
  inputSchema?: unknown
  parameters?: unknown
  execute?: (args: any) => Promise<string>
}

export function toolParametersToJsonSchema(fn: ToolLike | any): object {
  const schema = fn?.inputSchema ?? fn?.parameters
  if (!schema) return { ...EMPTY_OBJECT_SCHEMA }

  // Live Zod schema (AI SDK 6 / defineTool)
  if (typeof schema === "object" && schema !== null && "_def" in schema) {
    try {
      const json = zodToJsonSchema(schema as any, { $refStrategy: "none" }) as Record<string, unknown>
      if (json && typeof json === "object" && "$schema" in json) {
        delete json.$schema
      }
      return (json as object) ?? { ...EMPTY_OBJECT_SCHEMA }
    } catch {
      return { ...EMPTY_OBJECT_SCHEMA }
    }
  }

  if (typeof schema === "object") return schema as object
  return { ...EMPTY_OBJECT_SCHEMA }
}

/** OpenAI-style tools array for raw HTTP chat/completions bodies. */
export function toolsToArray(tools: Record<string, any>): Array<{
  type: "function"
  function: { name: string; description: string; parameters: object }
  execute?: (args: any) => Promise<string>
}> {
  return Object.entries(tools).map(([name, fn]) => ({
    type: "function" as const,
    function: {
      name,
      description: fn?.description || "",
      parameters: toolParametersToJsonSchema(fn),
    },
    execute: fn?.execute,
  }))
}

/** @deprecated alias — prefer toolsToArray */
export function toolsObjectToArray(tools: Record<string, any>): Array<any> {
  return toolsToArray(tools)
}

/**
 * Map of tool name → { description, parameters } suitable for proxy / HTTP.
 * Drops execute handlers (not serializable).
 */
export function serializeToolsForHttp(
  tools: Record<string, any> | null | undefined,
): Record<string, { description: string; parameters: object }> | undefined {
  if (!tools || typeof tools !== "object") return undefined
  const out: Record<string, { description: string; parameters: object }> = {}
  for (const [name, fn] of Object.entries(tools)) {
    out[name] = {
      description: (fn as any)?.description || "",
      parameters: toolParametersToJsonSchema(fn),
    }
  }
  return out
}

/** Validate args against a tool's Zod inputSchema when present. */
export function validateToolArgs(
  toolFn: any,
  args: unknown,
): { ok: true; data: unknown } | { ok: false; error: string; issues: unknown[]; received: unknown } {
  if (!toolFn?.inputSchema || typeof toolFn.inputSchema.safeParse !== "function") {
    return { ok: true, data: args }
  }
  const parsed = toolFn.inputSchema.safeParse(args)
  if (parsed?.success) return { ok: true, data: parsed.data }
  return {
    ok: false,
    error: "Invalid arguments for tool",
    issues: parsed?.error?.issues || [],
    received: args,
  }
}

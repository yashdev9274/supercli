import { zodToJsonSchema } from "zod-to-json-schema"

const EMPTY_OBJECT_SCHEMA = { type: "object", properties: {} } as const

/**
 * Convert an AI-SDK / harness tool definition's schema into plain JSON Schema.
 *
 * AI SDK 6 tools expose Zod via `inputSchema`. Older shapes used `parameters`
 * (already JSON Schema). JSON.stringify drops Zod `_def.shape` functions, so
 * callers that forward tools over HTTP must convert here while the live Zod
 * object is still intact — otherwise the model gets empty `{}` parameters and
 * tool calling stalls or fails validation.
 */
export function toolParametersToJsonSchema(fn: any): object {
  const schema = fn?.inputSchema ?? fn?.parameters
  if (!schema) return { ...EMPTY_OBJECT_SCHEMA }

  // Live Zod schema (AI SDK 6 / defineTool)
  if (typeof schema === "object" && schema !== null && "_def" in schema) {
    try {
      const json = zodToJsonSchema(schema, { $refStrategy: "none" }) as Record<string, unknown>
      if (json && typeof json === "object" && "$schema" in json) {
        delete json.$schema
      }
      return (json as object) ?? { ...EMPTY_OBJECT_SCHEMA }
    } catch {
      return { ...EMPTY_OBJECT_SCHEMA }
    }
  }

  // Already plain JSON Schema
  if (typeof schema === "object") return schema as object
  return { ...EMPTY_OBJECT_SCHEMA }
}

/** OpenAI-style tools array for raw HTTP chat/completions bodies. */
export function toolsToArray(tools: Record<string, any>): Array<any> {
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

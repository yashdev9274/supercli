import { z } from "zod"

export const CODEX_PROVIDER = "codex" as const
export const codexEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh"])
export type CodexEffort = z.infer<typeof codexEffortSchema>
export const codexModelSchema = z.object({
  id: z.string().min(1).max(128),
  label: z.string().min(1).max(160),
  description: z.string().max(2000),
  efforts: z.array(codexEffortSchema).max(6),
  defaultEffort: codexEffortSchema.nullable(),
  priority: z.number().finite(),
})
export type CodexModel = z.infer<typeof codexModelSchema>
export const codexCatalogSchema = z.object({ connected: z.boolean(), models: z.array(codexModelSchema).max(200) })

export function parseCodexModels(body: unknown): CodexModel[] {
  const parsed = z.object({ models: z.array(z.object({
    slug: z.string().min(1).max(128),
    display_name: z.string().min(1).max(160),
    description: z.string().max(2000).optional().default(""),
    visibility: z.enum(["list", "hide", "hidden"]).optional().default("hide"),
    priority: z.number().finite().optional().default(100),
    default_reasoning_level: z.string().nullable().optional(),
    supported_reasoning_levels: z.array(z.object({ effort: z.string() })).max(16).optional().default([]),
  })).max(200) }).safeParse(body)
  if (!parsed.success) throw new Error("Invalid Codex model catalog")
  const seen = new Set<string>()
  return parsed.data.models.filter((entry) => {
    if (entry.visibility !== "list" || seen.has(entry.slug)) return false
    seen.add(entry.slug)
    return true
  }).map((entry) => {
    const efforts = [...new Set(entry.supported_reasoning_levels.flatMap(({ effort }) => {
      const result = codexEffortSchema.safeParse(effort)
      return result.success ? [result.data] : []
    }))]
    const preferred = codexEffortSchema.safeParse(entry.default_reasoning_level)
    return {
      id: entry.slug, label: entry.display_name, description: entry.description,
      efforts, defaultEffort: preferred.success && efforts.includes(preferred.data) ? preferred.data : efforts[0] ?? null,
      priority: entry.priority,
    }
  }).sort((a, b) => a.priority - b.priority)
}

export function validateCodexSelection(models: CodexModel[], model: string | undefined, effort?: string): CodexModel {
  const entry = models.find((item) => item.id === model)
  if (!entry) throw new Error("This Codex model is unavailable. Refresh the model picker and select an available model.")
  if (effort && !entry.efforts.includes(effort as CodexEffort)) throw new Error("This reasoning effort is not supported by the selected Codex model.")
  return entry
}

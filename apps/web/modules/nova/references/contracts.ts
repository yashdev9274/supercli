import { z } from "zod"

export const referenceKindSchema = z.enum(["people", "threads", "pull_requests", "skills", "devices", "files"])
export type ReferenceKind = z.infer<typeof referenceKindSchema>

export const referenceInputSchema = z.object({
  kind: referenceKindSchema,
  id: z.string().trim().min(1).max(1_024),
})
export const referencesInputSchema = z.array(referenceInputSchema).max(10).default([])
export type ReferenceInput = z.infer<typeof referenceInputSchema>

export type NovaReference = ReferenceInput & {
  label: string
  description: string
}

export const novaReferenceSchema = referenceInputSchema.extend({
  label: z.string().max(200),
  description: z.string().max(200),
})

export function referencesFromMetadata(metadata: unknown): NovaReference[] {
  if (!metadata || typeof metadata !== "object" || !("references" in metadata)) return []
  const result = z.array(novaReferenceSchema).max(10).safeParse(metadata.references)
  return result.success ? result.data : []
}

export type ReferenceSearchResult = {
  items: NovaReference[]
  message?: string
}

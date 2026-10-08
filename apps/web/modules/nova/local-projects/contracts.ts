import { z } from "zod"

export const MAX_PROJECT_PATHS = 4_000
export const MAX_PROJECT_NAME = 120

export const localProjectPathSchema = z.string().trim().min(1).max(512)

export const upsertLocalProjectSchema = z.object({
  displayName: z.string().trim().min(1).max(MAX_PROJECT_NAME),
  rootName: z.string().trim().min(1).max(MAX_PROJECT_NAME),
  paths: z.array(localProjectPathSchema).max(MAX_PROJECT_PATHS),
  truncated: z.boolean().optional().default(false),
  repositoryFullName: z.string().trim().min(1).max(200).optional().nullable(),
})

export const updateLocalProjectSchema = z.object({
  displayName: z.string().trim().min(1).max(MAX_PROJECT_NAME).optional(),
  paths: z.array(localProjectPathSchema).max(MAX_PROJECT_PATHS).optional(),
  truncated: z.boolean().optional(),
  repositoryFullName: z.string().trim().min(1).max(200).optional().nullable(),
  status: z.enum(["active", "archived"]).optional(),
})

export const bindSessionProjectSchema = z.object({
  projectId: z.string().trim().min(1).max(64).nullable(),
})

export type LocalProjectSummary = {
  id: string
  displayName: string
  rootName: string
  fileCount: number
  truncated: boolean
  repositoryFullName: string | null
  status: string
  lastUsedAt: string | null
  updatedAt: string
  /** Present on detail fetches / after create-update. */
  paths?: string[]
}

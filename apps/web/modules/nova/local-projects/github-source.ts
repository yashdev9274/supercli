import { z } from "zod"

export const githubSourceSchema = z.object({
  repositoryFullName: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  branch: z.string().min(1).max(255).refine((value) => !/[\x00-\x20\x7f]/.test(value)),
  sha: z.string().regex(/^[a-f0-9]{40}$/),
}).strict()

export type GithubSource = z.infer<typeof githubSourceSchema>

export function githubSourceFromPolicy(policy: unknown): GithubSource | undefined {
  if (!policy || typeof policy !== "object" || !("githubSource" in policy)) return undefined
  return githubSourceSchema.parse(policy.githubSource)
}

export function assertGithubSourceRepository(source: GithubSource, repository: string | null | undefined) {
  if (source.repositoryFullName.toLowerCase() !== repository?.toLowerCase()) {
    throw new Error("Project repository no longer matches the immutable session source")
  }
}

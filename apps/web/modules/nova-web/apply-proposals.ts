import type { FileProposalDto } from "@/modules/nova-web/api"
import {
  ensureLocalWorkspaceWritable,
  getLocalWorkspace,
  hasLocalWorkspaceHandle,
  writeLocalWorkspaceFile,
} from "@/modules/nova-web/local-workspace"

export type ApplyResult = {
  path: string
  ok: boolean
  error?: string
}

export type ApplyBatchResult = {
  results: ApplyResult[]
  applied: number
  failed: number
  /** True when we had to prompt the user for a folder / write grant. */
  neededGrant: boolean
  message: string
}

/**
 * Apply agent proposals to the linked project folder.
 * Must run from a user gesture (click) so the browser allows write permission
 * and, if needed, a directory picker.
 */
export async function applyFileProposalsLocally(
  proposals: FileProposalDto[],
  options?: { interactive?: boolean },
): Promise<ApplyBatchResult> {
  const interactive = options?.interactive !== false
  let neededGrant = false

  if (proposals.length === 0) {
    return {
      results: [],
      applied: 0,
      failed: 0,
      neededGrant: false,
      message: "No file changes to apply",
    }
  }

  if (interactive) {
    const grant = await ensureLocalWorkspaceWritable()
    neededGrant = grant.prompted
    if (!grant.ok) {
      return {
        results: proposals.map((p) => ({ path: p.path, ok: false, error: grant.error })),
        applied: 0,
        failed: proposals.length,
        neededGrant: true,
        message: grant.error || "Could not get write access to the project folder",
      }
    }
  } else if (!hasLocalWorkspaceHandle()) {
    return {
      results: proposals.map((p) => ({
        path: p.path,
        ok: false,
        error: "No local folder linked yet",
      })),
      applied: 0,
      failed: proposals.length,
      neededGrant: true,
      message: "Click “Make these changes” to grant folder write access and apply all files",
    }
  }

  const workspace = getLocalWorkspace()
  const results: ApplyResult[] = []

  for (const proposal of proposals) {
    const target = normalizeWritePath(proposal.path, workspace?.entries.map((e) => e.path) ?? [])
    const written = await writeLocalWorkspaceFile(target, proposal.content)
    if (written.ok) {
      results.push({ path: written.path, ok: true })
    } else {
      results.push({ path: proposal.path, ok: false, error: written.error })
    }
  }

  const applied = results.filter((r) => r.ok).length
  const failed = results.length - applied
  const message =
    failed === 0
      ? `Applied ${applied} file${applied === 1 ? "" : "s"} to your project folder`
      : applied === 0
        ? `Couldn’t write files: ${results[0]?.error || "permission denied"}`
        : `Applied ${applied}/${results.length} files · ${failed} failed`

  return { results, applied, failed, neededGrant, message }
}

/** Map model paths onto the granted folder tree when possible. */
function normalizeWritePath(path: string, indexed: string[]): string {
  const clean = path.replaceAll("\\", "/").replace(/^\.\//, "")
  if (!indexed.length) return clean
  if (indexed.includes(clean)) return clean

  const base = clean.split("/").pop() || clean
  const byBase = indexed.filter((p) => (p.split("/").pop() || p) === base)
  if (byBase.length === 1) return byBase[0]!

  // Strip leading segments until the remainder matches an indexed prefix or path
  const parts = clean.split("/").filter(Boolean)
  for (let i = 0; i < parts.length - 1; i += 1) {
    const rest = parts.slice(i).join("/")
    if (indexed.includes(rest)) return rest
    const suffixHits = indexed.filter((p) => p.endsWith(`/${rest}`) || p === rest)
    if (suffixHits.length === 1) return suffixHits[0]!
  }

  // If the first segment isn't a workspace top-level, strip until it is
  const tops = new Set(indexed.map((p) => p.split("/")[0]!).filter(Boolean))
  let start = 0
  while (start < parts.length - 1 && !tops.has(parts[start]!)) start += 1
  if (start > 0) return parts.slice(start).join("/")

  return clean
}

export function stripProposalTrailer(body: string): string {
  return body.replace(/\n?<!-- nova_file_proposals[\s\S]*?-->\s*$/m, "").trimEnd()
}

export function recoverProposalsFromBody(body: string): FileProposalDto[] {
  const match = body.match(/<!-- nova_file_proposals\n([\s\S]*?)\n-->/)
  if (!match?.[1]) return []
  try {
    const parsed = JSON.parse(match[1].replaceAll("--\\>", "-->")) as Array<{
      path: string
      content: string
      language?: string | null
    }>
    return parsed
      .filter((item) => item?.path && typeof item.content === "string")
      .map((item) => ({
        path: item.path,
        content: item.content,
        language: item.language ?? undefined,
      }))
  } catch {
    return []
  }
}

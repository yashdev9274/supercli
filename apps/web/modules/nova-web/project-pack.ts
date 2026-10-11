import {
  MAX_LOCAL_FILE_BYTES,
  MAX_LOCAL_TOTAL_BYTES,
  type LocalAttachment,
} from "@/modules/nova/attachments/contracts"
import {
  isLikelyTextProjectPath,
  MAX_PROJECT_PACK_FILES,
  rankProjectPaths,
} from "@/modules/nova/local-projects/rank-paths"
import {
  getLocalWorkspace,
  readLocalWorkspaceFile,
} from "@/modules/nova-web/local-workspace"

/**
 * Read the most relevant local-folder files into attachments for this turn.
 * Requires a live File System Access handle — virtual/GitHub path indexes
 * are packed on the server instead.
 */
export async function packLocalProjectForTurn(
  objective: string,
  existing: LocalAttachment[] = [],
): Promise<LocalAttachment[]> {
  const workspace = getLocalWorkspace()
  // getLocalWorkspace() returns virtual entries without a handle; those can't be read here.
  // Detect that by attempting reads only when we have real entries from a granted folder.
  if (!workspace || workspace.entries.length === 0) return existing

  // Fast path: if the first few high-ranked paths all fail to read, there is no handle.
  const textPaths = workspace.entries
    .filter((entry) => entry.kind === "text" || isLikelyTextProjectPath(entry.path))
    .map((entry) => entry.path)

  if (textPaths.length === 0) return existing

  const ranked = rankProjectPaths(textPaths, objective, MAX_PROJECT_PACK_FILES)
  if (ranked.length === 0) return existing

  const packed = [...existing]
  let total = packed.reduce((sum, file) => sum + file.size, 0)
  const seen = new Set(packed.map((file) => file.name))
  let failures = 0

  for (const { path } of ranked) {
    if (packed.length >= MAX_PROJECT_PACK_FILES) break
    if (seen.has(path)) continue
    if (total >= MAX_LOCAL_TOTAL_BYTES) break

    const read = await readLocalWorkspaceFile(path)
    if (!read.ok || !read.attachment.text) {
      failures += 1
      // No folder handle (or revoked) — stop; server GitHub pack may still help.
      if (failures >= 3 && packed.length === existing.length) return existing
      continue
    }
    if (read.attachment.size > MAX_LOCAL_FILE_BYTES) continue
    if (total + read.attachment.size > MAX_LOCAL_TOTAL_BYTES) continue

    packed.push(read.attachment)
    seen.add(path)
    total += read.attachment.size
  }

  return packed
}

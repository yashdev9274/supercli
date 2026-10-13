/**
 * Parse mergeable file proposals out of an agent answer.
 * Supports:
 *   ```tsx path=apps/web/foo.tsx
 *   ...body...
 *   ```
 *   ```ts file=apps/web/foo.ts
 *   ```
 *   --- a/path
 *   +++ b/path
 *   @@ ... unified diff (best-effort full-file only when it's a pure add)
 */

export type FileProposal = {
  path: string
  content: string
  language?: string
}

const FENCE_RE =
  /```([A-Za-z0-9_+.-]*)[^\n]*?(?:path|file)\s*=\s*([^\s\n`]+)[^\n]*\n([\s\S]*?)```/gi

const ALT_FENCE_RE =
  /```([A-Za-z0-9_+.-]*)\s+([A-Za-z0-9_./@+-]+\.[A-Za-z0-9]{1,12})\s*\n([\s\S]*?)```/gi

function cleanPath(raw: string): string | null {
  let path = raw.trim().replace(/^["'`]|["'`]$/g, "")
  path = path.replace(/^\.\//, "").replaceAll("\\", "/")
  // Strip accidental a/ b/ prefixes from diffs
  if (path.startsWith("a/") || path.startsWith("b/")) path = path.slice(2)
  if (!path || path.includes("..")) return null
  if (!/^[A-Za-z0-9_./@+-]+$/.test(path)) return null
  if (!path.includes(".") && !path.includes("/")) return null
  return path
}

export function parseFileProposals(text: string): FileProposal[] {
  if (!text?.trim()) return []
  const byPath = new Map<string, FileProposal>()

  const push = (pathRaw: string, content: string, language?: string) => {
    const path = cleanPath(pathRaw)
    if (!path) return
    const body = content.replace(/^\n/, "").replace(/\n$/, "")
    // Ignore empty or tiny stubs
    if (body.trim().length < 8) return
    // Prefer later (usually final) version of the same path
    byPath.set(path, {
      path,
      content: body.endsWith("\n") ? body : `${body}\n`,
      language: language || undefined,
    })
  }

  for (const match of text.matchAll(FENCE_RE)) {
    push(match[2]!, match[3] ?? "", match[1] || undefined)
  }

  // Fallback: ```tsx apps/web/foo.tsx\n...
  for (const match of text.matchAll(ALT_FENCE_RE)) {
    const maybePath = match[2]!
    if (!maybePath.includes("/") && !maybePath.includes(".")) continue
    // Skip if already captured via path=
    if (byPath.has(cleanPath(maybePath) ?? "")) continue
    push(maybePath, match[3] ?? "", match[1] || undefined)
  }

  return [...byPath.values()]
}

/** Resolve a model path against an indexed project tree (fuzzy). */
export function resolveProposalPath(
  proposed: string,
  indexedPaths: string[],
): string {
  const clean = cleanPath(proposed) || proposed
  if (indexedPaths.includes(clean)) return clean

  const base = clean.split("/").pop() || clean
  const lower = clean.toLowerCase()

  // Exact basename unique match
  const byBase = indexedPaths.filter((p) => (p.split("/").pop() || p) === base)
  if (byBase.length === 1) return byBase[0]!

  // Suffix match
  const bySuffix = indexedPaths.filter(
    (p) => p === clean || p.endsWith(`/${clean}`) || p.endsWith(clean),
  )
  if (bySuffix.length === 1) return bySuffix[0]!

  // Contains path segments from the proposal
  const segments = lower.split("/").filter((s) => s && s !== "apps" && s !== "src")
  if (segments.length >= 2) {
    const scored = indexedPaths
      .map((p) => {
        const pl = p.toLowerCase()
        let score = 0
        for (const seg of segments) {
          if (pl.includes(seg)) score += 1
        }
        if ((p.split("/").pop() || "") === base) score += 5
        return { p, score }
      })
      .filter((x) => x.score >= Math.min(2, segments.length))
      .sort((a, b) => b.score - a.score)
    if (scored[0] && scored[0].score >= (scored[1]?.score ?? 0) + 1) {
      return scored[0].p
    }
  }

  return clean
}

export function remapProposals(
  proposals: FileProposal[],
  indexedPaths: string[],
): FileProposal[] {
  if (!indexedPaths.length) return proposals
  const out = new Map<string, FileProposal>()
  for (const proposal of proposals) {
    const path = resolveProposalPath(proposal.path, indexedPaths)
    out.set(path, { ...proposal, path })
  }
  return [...out.values()]
}

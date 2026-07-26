const NPM_REGISTRY = "https://registry.npmjs.org"

export const NPM_PACKAGE = "supercode-cli"

/**
 * Valid semver pattern: MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]
 * Handles v prefix, partial versions like "1.0" (missing parts → 0),
 * and rejects malformed suffixes like "1.2.3foo".
 */
const SEMVER_RE = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: string | null
}

/**
 * Parse a semver string into its components.
 * Returns null for invalid versions.
 */
function parseSemver(v: string): ParsedVersion | null {
  const match = v.match(SEMVER_RE)
  if (!match) return null
  const major = parseInt(match[1]!, 10)
  const minor = match[2] ? parseInt(match[2], 10) : 0
  const patch = match[3] ? parseInt(match[3], 10) : 0
  const prerelease = match[4] ?? null
  return { major, minor, patch, prerelease }
}

/**
 * Compare two prerelease identifiers per semver spec:
 * - No prerelease > with prerelease (stable wins)
 * - Split on ".", compare field by field
 * - Numeric fields compare numerically, string fields lexicographically
 * - Numeric < string
 */
function comparePrerelease(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0
  if (a === null) return 1   // stable > prerelease
  if (b === null) return -1  // prerelease < stable

  const aParts = a.split(".")
  const bParts = b.split(".")
  const len = Math.max(aParts.length, bParts.length)

  for (let i = 0; i < len; i++) {
    const ap = aParts[i]
    const bp = bParts[i]
    if (ap === undefined) return -1
    if (bp === undefined) return 1

    const aIsNum = /^\d+$/.test(ap)
    const bIsNum = /^\d+$/.test(bp)

    if (aIsNum && bIsNum) {
      const aNum = parseInt(ap, 10)
      const bNum = parseInt(bp, 10)
      if (aNum !== bNum) return aNum < bNum ? -1 : 1
    } else if (aIsNum) {
      return -1 // numeric < string
    } else if (bIsNum) {
      return 1  // string > numeric
    } else if (ap !== bp) {
      return ap < bp ? -1 : 1
    }
  }
  return 0
}

/**
 * Compare two semver strings.
 * Returns -1 if a < b, 0 if a === b, 1 if a > b.
 * Returns null if either version is unparseable.
 */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return null

  if (pa.major !== pb.major) return pa.major < pb.major ? -1 : 1
  if (pa.minor !== pb.minor) return pa.minor < pb.minor ? -1 : 1
  if (pa.patch !== pb.patch) return pa.patch < pb.patch ? -1 : 1

  const pc = comparePrerelease(pa.prerelease, pb.prerelease)
  if (pc !== 0) return pc < 0 ? -1 : 1
  return 0
}

/**
 * Fetch the latest published version from npm registry.
 * Returns null on failure or if the response is malformed.
 */
export async function fetchLatestVersion(
  packageName: string = NPM_PACKAGE,
): Promise<string | null> {
  try {
    const res = await fetch(`${NPM_REGISTRY}/${packageName}/latest`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: unknown }
    if (typeof data.version !== "string" || data.version.length === 0) return null
    return data.version
  } catch {
    return null
  }
}

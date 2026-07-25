const NPM_REGISTRY = "https://registry.npmjs.org"

const NPM_PACKAGE_NAME = "supercode-cli"

/**
 * Parse a semver string into its numeric parts.
 * Returns null for invalid versions.
 */
function parseSemver(v: string): number[] | null {
  const parts = v.replace(/^v/, "").split(".")
  const nums = parts.map((p) => {
    const n = parseInt(p, 10)
    return isNaN(n) ? -1 : n
  })
  if (nums.some((n) => n < 0) || nums.length === 0) return null
  return nums
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

  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na < nb) return -1
    if (na > nb) return 1
  }
  return 0
}

/**
 * Fetch the latest published version from npm registry.
 * Returns null on failure.
 */
export async function fetchLatestVersion(
  packageName: string = NPM_PACKAGE_NAME,
): Promise<string | null> {
  try {
    const res = await fetch(`${NPM_REGISTRY}/${packageName}/latest`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { version: string }
    return data.version ?? null
  } catch {
    return null
  }
}

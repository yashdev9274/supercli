const PERMANENT_EMBEDDING_CODES = new Set([
  "billing_hard_limit_reached",
  "credit_balance_exhausted",
  "insufficient_quota",
])

const ERROR_LINK_KEYS = ["cause", "lastError", "error"] as const
const ERROR_CODE_KEYS = ["code", "type"] as const

type ErrorRecord = Record<string, unknown>

function asRecord(value: unknown): ErrorRecord | null {
  return typeof value === "object" && value !== null
    ? (value as ErrorRecord)
    : null
}

function parseResponseBody(value: unknown): unknown {
  if (typeof value !== "string") return value

  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function findPermanentCode(
  value: unknown,
  seen: Set<unknown> = new Set(),
): string | null {
  if (seen.has(value)) return null

  const record = asRecord(value)
  if (!record) return null
  seen.add(value)

  for (const key of ERROR_CODE_KEYS) {
    const candidate = record[key]
    if (
      typeof candidate === "string" &&
      PERMANENT_EMBEDDING_CODES.has(candidate.toLowerCase())
    ) {
      return candidate.toLowerCase()
    }
  }

  for (const key of ["responseBody", "data"] as const) {
    const nested = parseResponseBody(record[key])
    const code = findPermanentCode(nested, seen)
    if (code) return code
  }

  for (const key of ERROR_LINK_KEYS) {
    const code = findPermanentCode(record[key], seen)
    if (code) return code
  }

  return null
}

export function permanentEmbeddingFailureReason(error: unknown): string | null {
  const code = findPermanentCode(error)
  if (!code) return null

  if (code === "credit_balance_exhausted") {
    return "embedding provider credit balance exhausted"
  }
  if (code === "billing_hard_limit_reached") {
    return "embedding provider billing limit reached"
  }
  return "embedding provider quota exhausted"
}

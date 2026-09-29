export const INLINE_FINDINGS_START = "<!-- supercode-inline-findings:start -->"
export const INLINE_FINDINGS_END = "<!-- supercode-inline-findings:end -->"
export const MAX_INLINE_FINDINGS = 20

export type ReviewFindingSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "nit"

export type ReviewFinding = {
  severity: ReviewFindingSeverity
  title: string
  body: string
  path: string
  line: number
  side: "LEFT" | "RIGHT"
}

export type ValidatedReviewFinding = ReviewFinding

const SEVERITIES = new Set<ReviewFindingSeverity>([
  "critical",
  "high",
  "medium",
  "low",
  "nit",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function parseFinding(value: unknown): ReviewFinding | null {
  if (!isRecord(value)) return null

  const severity = value.severity
  const title = value.title
  const body = value.body
  const path = value.path
  const line = value.line
  const side = value.side

  if (typeof severity !== "string" || !SEVERITIES.has(severity as ReviewFindingSeverity)) {
    return null
  }
  if (typeof title !== "string" || !title.trim()) return null
  if (typeof body !== "string" || !body.trim()) return null
  if (typeof path !== "string" || !path.trim()) return null
  if (!Number.isInteger(line) || (line as number) <= 0) return null
  if (side !== "LEFT" && side !== "RIGHT") return null

  return {
    severity: severity as ReviewFindingSeverity,
    title: title.trim().slice(0, 160),
    body: body.trim().slice(0, 6_000),
    path: path.trim(),
    line: line as number,
    side,
  }
}

export function parseReviewResponse(text: string): {
  review: string
  findings: ReviewFinding[]
} {
  const start = text.lastIndexOf(INLINE_FINDINGS_START)
  const end = text.lastIndexOf(INLINE_FINDINGS_END)
  if (start < 0 || end <= start) {
    return { review: text.trim(), findings: [] }
  }

  const review = `${text.slice(0, start)}${text.slice(end + INLINE_FINDINGS_END.length)}`.trim()
  const raw = text.slice(start + INLINE_FINDINGS_START.length, end).trim()
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")

  try {
    const parsed = JSON.parse(json) as unknown
    const values = isRecord(parsed) && Array.isArray(parsed.findings)
      ? parsed.findings
      : []
    return {
      review,
      findings: values.map(parseFinding).filter((item): item is ReviewFinding => item !== null),
    }
  } catch {
    return { review, findings: [] }
  }
}

type ChangedFilePatch = {
  filename: string
  patch?: string
}

type DiffAnchor = `${"LEFT" | "RIGHT"}:${number}`

function collectPatchAnchors(patch: string): Set<DiffAnchor> {
  const anchors = new Set<DiffAnchor>()
  let oldLine = 0
  let newLine = 0
  let inHunk = false

  for (const patchLine of patch.split("\n")) {
    const hunk = patchLine.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      inHunk = true
      continue
    }
    if (!inHunk || patchLine.startsWith("\\ No newline")) continue

    if (patchLine.startsWith("+")) {
      anchors.add(`RIGHT:${newLine}`)
      newLine += 1
      continue
    }
    if (patchLine.startsWith("-")) {
      anchors.add(`LEFT:${oldLine}`)
      oldLine += 1
      continue
    }
    if (patchLine.startsWith(" ")) {
      anchors.add(`LEFT:${oldLine}`)
      anchors.add(`RIGHT:${newLine}`)
      oldLine += 1
      newLine += 1
    }
  }

  return anchors
}

export function validateInlineFindings(
  findings: ReviewFinding[],
  changedFiles: ChangedFilePatch[],
): ValidatedReviewFinding[] {
  const anchorsByPath = new Map(
    changedFiles
      .filter((file): file is ChangedFilePatch & { patch: string } => Boolean(file.patch))
      .map((file) => [file.filename, collectPatchAnchors(file.patch)]),
  )
  const seen = new Set<string>()
  const validated: ValidatedReviewFinding[] = []

  for (const finding of findings) {
    const anchors = anchorsByPath.get(finding.path)
    if (!anchors?.has(`${finding.side}:${finding.line}`)) continue

    const key = `${finding.path}:${finding.side}:${finding.line}`
    if (seen.has(key)) continue
    seen.add(key)
    validated.push(finding)

    if (validated.length >= MAX_INLINE_FINDINGS) break
  }

  return validated
}

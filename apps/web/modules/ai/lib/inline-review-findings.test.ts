import { describe, expect, test } from "bun:test"

import {
  INLINE_FINDINGS_END,
  INLINE_FINDINGS_START,
  parseReviewResponse,
  validateInlineFindings,
  type ReviewFinding,
} from "./inline-review-findings"

const finding: ReviewFinding = {
  severity: "high",
  title: "Authorization can cross tenants",
  body: "Scope the lookup to the current organization before using this record.",
  path: "src/auth.ts",
  line: 11,
  side: "RIGHT",
}

const patch = [
  "@@ -8,4 +8,5 @@ function authorize() {",
  "   const user = currentUser()",
  "-  return findFirst({ provider })",
  "+  const record = findFirst({ provider })",
  "+  return record",
  " }",
].join("\n")

describe("inline review findings", () => {
  test("extracts structured findings without exposing metadata in the review", () => {
    const response = [
      "### Summary",
      "Adds authorization checks.",
      INLINE_FINDINGS_START,
      JSON.stringify({ findings: [finding] }),
      INLINE_FINDINGS_END,
    ].join("\n")

    expect(parseReviewResponse(response)).toEqual({
      review: "### Summary\nAdds authorization checks.",
      findings: [finding],
    })
  })

  test("keeps the review and returns no findings for malformed metadata", () => {
    const response = [
      "### Summary\nComplete review.",
      INLINE_FINDINGS_START,
      "not json",
      INLINE_FINDINGS_END,
    ].join("\n")

    expect(parseReviewResponse(response)).toEqual({
      review: "### Summary\nComplete review.",
      findings: [],
    })
  })

  test("accepts only exact current diff anchors and deduplicates lines", () => {
    const findings: ReviewFinding[] = [
      finding,
      { ...finding, title: "Duplicate" },
      { ...finding, line: 99 },
      { ...finding, line: 10, side: "LEFT" },
      { ...finding, path: "src/missing.ts" },
    ]

    expect(
      validateInlineFindings(findings, [{ filename: "src/auth.ts", patch }]),
    ).toEqual([
      finding,
      { ...finding, line: 10, side: "LEFT" },
    ])
  })

  test("does not post findings for files whose patch GitHub omitted", () => {
    expect(
      validateInlineFindings([finding], [{ filename: "src/auth.ts" }]),
    ).toEqual([])
  })
})

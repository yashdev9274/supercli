import { describe, expect, test } from "bun:test"

import {
  extractFindingsSection,
  parseFindings,
  resolveFindingPath,
  severityRank,
} from "./parse-findings"

describe("review findings section extraction", () => {
  test("extracts only findings while preserving nested headings and fenced examples", () => {
    const section = [
      "### Findings",
      "- **[high] Missing authorization** — `src/auth.ts:42`",
      "  Check ownership before returning a record.",
      "#### Suggested fix",
      "```typescript",
      "### Risk assessment",
      "- **[critical] Example, not a finding** — `fake.ts`",
      "```",
    ].join("\n")
    const review = `### Summary\nA change.\n\n${section}\n\n### Risk assessment\nLow.`
    expect(extractFindingsSection(review)).toBe(section)
    const findings = parseFindings(extractFindingsSection(review))
    expect(findings).toHaveLength(1)
    expect(findings[0].title).toBe("Missing authorization")
    expect(findings[0].snippets[0].code).toContain("Example, not a finding")
  })

  test("does not use a fake findings heading inside a code fence", () => {
    const review = [
      "### Summary",
      "````markdown",
      "### Findings",
      "- **[critical] Example only** — `fake.ts`",
      "```",
      "### Test plan",
      "````",
      "### Findings",
      "- **[medium] A real finding** — `src/state.ts`",
      "  Cancel stale requests.",
      "### Test plan",
      "- [ ] Verify cancellation.",
    ].join("\n")
    const findings = parseFindings(extractFindingsSection(review))
    expect(findings).toHaveLength(1)
    expect(findings[0].title).toBe("A real finding")
    expect(findings[0].description).toBe("Cancel stale requests.")
  })

  test.each(["## Bugs Found", "# Issues", "### Findings ###"])("accepts the %s heading", (heading) => {
    const findings = parseFindings(extractFindingsSection(`${heading}\n- **[high] Bug** — \`src/auth.ts\`\n  Fix it.\n# Next section\nUnrelated text.`))
    expect(findings).toHaveLength(1)
    expect(findings[0].description).toBe("Fix it.")
  })

  test("supports CRLF and keeps legacy flat findings without a heading", () => {
    const finding = "- **[high] Bug** — `src/auth.ts`\r\n  Fix it."
    expect(parseFindings(extractFindingsSection(finding))[0].description).toBe("Fix it.")
    expect(extractFindingsSection(`## Findings\r\n${finding}\r\n## Summary\r\nOther.`)).not.toContain("Other.")
  })
})

describe("sidebar findings parsing", () => {
  test("parses indented and numbered findings and keeps distinct bugs in the same file", () => {
    const findings = parseFindings([
      "  - **[MEDIUM] Stale state** — `src/auth.ts`",
      "    Cancel the previous request.",
      "1. **[critical] Missing ownership check** — `src/auth.ts:42`",
      "   Scope the lookup to the current user.",
      "2) [high] Unsafe redirect — src/routes.ts",
      "   Restrict the redirect target.",
    ].join("\n"))
    expect(findings.map((finding) => finding.severity)).toEqual(["medium", "critical", "high"])
    expect(findings[0].title).toBe("Stale state")
    expect(findings[1].filePath).toBe("src/auth.ts:42")
    expect(findings.sort((a, b) => severityRank(a.severity) - severityRank(b.severity)).map((finding) => finding.severity)).toEqual(["critical", "high", "medium"])
  })

  test("keeps issue, fix, and diff code blocks with their original finding", () => {
    const findings = parseFindings([
      "- **[high] Missing guard** — `src/auth.ts`",
      "Current issue:",
      "```ts",
      "return record",
      "```",
      "Suggested fix:",
      "```ts",
      "if (!authorized) throw new Error('Forbidden')",
      "```",
      "```diff",
      "-return record",
      "+return scopedRecord",
      "```",
    ].join("\n"))
    expect(findings).toHaveLength(1)
    expect(findings[0].snippets.map((snippet) => snippet.kind)).toEqual(["issue", "fix", "diff"])
    expect(findings[0].snippets[0].language).toBe("ts")
  })

  test("ignores severity bullets in tilde fences and incomplete code examples", () => {
    const findings = parseFindings([
      "~~~~markdown",
      "- **[critical] Fake bug** — `fake.ts`",
      "~~~",
      "- **[critical] Still code** — `fake.ts`",
      "~~~~",
      "- **[high] Real bug** — `src/auth.ts`",
      "  Validate access.",
      "```text",
      "- **[critical] Example under the real bug** — `fake.ts`",
    ].join("\n"))
    expect(findings).toHaveLength(1)
    expect(findings[0].title).toBe("Real bug")
    expect(findings[0].snippets[0].code).toContain("Example under the real bug")
  })

  test("does not invent findings for a clean, failed, or empty review", () => {
    for (const source of ["### Findings\nNo blocking issues found.", "Error: review unavailable", ""]) {
      expect(parseFindings(extractFindingsSection(source))).toEqual([])
    }
  })
})

describe("finding diff targets", () => {
  const filenames = new Set(["src/auth.ts", "src/input:42", "src/routes.ts"])

  test.each(["src/auth.ts", "src/auth.ts:42", "src/auth.ts:42:8", "src/auth.ts:L42-L45", "src/auth.ts:42-45"])("resolves %s only to a real changed file", (path) => {
    expect(resolveFindingPath(path, filenames)).toBe("src/auth.ts")
  })

  test("prefers an exact filename when it contains a colon", () => {
    expect(resolveFindingPath("src/input:42", filenames)).toBe("src/input:42")
  })

  test("does not guess a target from a basename or nonexistent file", () => {
    expect(resolveFindingPath("auth.ts", filenames)).toBeNull()
    expect(resolveFindingPath("other/auth.ts:42", filenames)).toBeNull()
    expect(resolveFindingPath("https://attacker.invalid/src/auth.ts", filenames)).toBeNull()
  })
})

import { describe, expect, test } from "bun:test"

import { DEFAULT_REVIEW_SETTINGS } from "./review-settings"
import { formatReviewSummary, parseReviewSections } from "./review-summary"

const review = [
  "### Summary",
  "Adds scoped authorization.",
  "### PR description summary",
  "Bug Fixes\n- Scope the lookup.",
  "### Walkthrough",
  "- Updates src/auth.ts.",
  "### Changes table",
  "| File | Summary |\n| --- | --- |\n| src/auth.ts | Scopes access |",
  "### Findings",
  "- **[high] Missing tenant scope** — `src/auth.ts`\n  Validate the tenant.",
  "### Risk assessment",
  "**Medium** — authorization changes.",
  "### Test plan",
  "- [ ] Verify cross-tenant access fails.",
  "### Suggested PR description",
  "## What\nScope authorization.\n## Why\nPrevent cross-tenant access.",
  "### Confidence Score",
  "4/5 — the diff is clear, but no tests were run.",
  "### Sequence Diagram",
  "```mermaid\nsequenceDiagram\nClient->>API: authorize\nAPI->>DB: scoped lookup\n```",
].join("\n\n")

describe("review section parsing", () => {
  test("ignores heading-shaped lines inside backtick and tilde fences", () => {
    const sections = parseReviewSections([
      "### Findings",
      "Example:",
      "```markdown",
      "### Summary",
      "This belongs to the example.",
      "```",
      "~~~md",
      "### Sequence Diagram",
      "~~~",
      "### Test plan",
      "Verify behavior.",
    ].join("\n"))

    expect(sections.map((section) => section.heading)).toEqual(["Findings", "Test plan"])
    expect(sections[0].content).toContain("### Summary")
    expect(sections[0].content).toContain("### Sequence Diagram")
  })

  test("requires a matching fence character and a long enough closing fence", () => {
    const sections = parseReviewSections([
      "### Findings",
      "````markdown",
      "```",
      "### Summary",
      "~~~",
      "### Confidence Score",
      "````",
      "### Test plan",
      "Done.",
    ].join("\r\n"))

    expect(sections.map((section) => section.heading)).toEqual(["Findings", "Test plan"])
  })

  test("keeps nested headings and normalizes closing heading markers", () => {
    const sections = parseReviewSections("## Summary ##\nOverview.\n#### Details\nMore context.\n## Findings ##\nNone.")
    expect(sections.map((section) => section.heading)).toEqual(["Summary", "Findings"])
    expect(sections[0].content).toContain("#### Details\nMore context.")
  })

  test("does not treat headings in an unclosed fence as new sections", () => {
    const sections = parseReviewSections("### Findings\n```ts\n### Summary\nconst value = 1")
    expect(sections).toHaveLength(1)
    expect(sections[0].content).toContain("### Summary")
  })
})

describe("sticky review summary formatting", () => {
  test("preserves default review sections, excluding the description-only summary", () => {
    const result = formatReviewSummary(review, DEFAULT_REVIEW_SETTINGS)
    for (const heading of ["Summary", "Walkthrough", "Changes table", "Findings", "Risk assessment", "Test plan", "Suggested PR description"]) {
      expect(result).toContain(`### ${heading}`)
    }
    expect(result).toContain("## What\nScope authorization.")
    expect(result).not.toContain("### PR description summary")
    expect(result).not.toContain("Bug Fixes")
    expect(result).not.toContain("### Confidence Score")
    expect(result).not.toContain("### Sequence Diagram")
    expect(result).not.toContain("<details")
  })

  test("hides the whole summary group rather than only its first heading", () => {
    const result = formatReviewSummary(review, { ...DEFAULT_REVIEW_SETTINGS, includeSummary: false })
    expect(result).toContain("### Findings")
    for (const heading of ["Summary", "Walkthrough", "Changes table", "Risk assessment", "Test plan", "Suggested PR description"]) {
      expect(result).not.toContain(`### ${heading}`)
    }
    expect(result).not.toContain("## What")
  })

  test("independently selects findings, confidence, and the sequence diagram", () => {
    const result = formatReviewSummary(review, {
      ...DEFAULT_REVIEW_SETTINGS,
      includeSummary: false,
      includeFindings: false,
      includeConfidence: true,
      includeSequenceDiagram: true,
    })
    expect(result).toContain("### Confidence Score\n\n4/5")
    expect(result).toContain("```mermaid\nsequenceDiagram")
    expect(result).not.toContain("### Findings")
    expect(result).not.toContain("### Summary")
  })

  test("collapses the summary group and diagram independently with fixed labels", () => {
    const result = formatReviewSummary(review, {
      ...DEFAULT_REVIEW_SETTINGS,
      summaryCollapsible: true,
      summaryDefaultOpen: true,
      includeSequenceDiagram: true,
      diagramCollapsible: true,
      diagramDefaultOpen: false,
      commentHeader: "</summary><script>invalid</script>",
    })
    expect(result).toContain("<details open>\n<summary>Summary</summary>")
    expect(result).toContain("<details>\n<summary>Sequence diagram</summary>")
    expect(result.match(/<details/g)).toHaveLength(2)
    expect(result.indexOf("### Suggested PR description")).toBeLessThan(result.indexOf("</details>"))
    expect(result).not.toContain("<script>")
    expect(result).not.toContain("### PR description summary")
  })

  test("the default-open flags do nothing when collapse is disabled", () => {
    const result = formatReviewSummary(review, {
      ...DEFAULT_REVIEW_SETTINGS,
      summaryDefaultOpen: true,
      includeSequenceDiagram: true,
      diagramDefaultOpen: true,
    })
    expect(result).not.toContain("<details")
  })

  test("can leave the summary closed and the diagram open", () => {
    const result = formatReviewSummary(review, {
      ...DEFAULT_REVIEW_SETTINGS,
      summaryCollapsible: true,
      includeSequenceDiagram: true,
      diagramCollapsible: true,
      diagramDefaultOpen: true,
    })
    expect(result).toContain("<details>\n<summary>Summary</summary>")
    expect(result).toContain("<details open>\n<summary>Sequence diagram</summary>")
  })

  test("uses a short fallback when nothing is selected or available", () => {
    const settings = { ...DEFAULT_REVIEW_SETTINGS, includeSummary: false, includeFindings: false }
    expect(formatReviewSummary(review, settings)).toBe("Review complete. See inline comments for any actionable findings.")
    expect(formatReviewSummary("", DEFAULT_REVIEW_SETTINGS)).toBe("Review complete. See inline comments for any actionable findings.")
    expect(formatReviewSummary("### Summary\n\n### PR description summary\nOnly the description.", DEFAULT_REVIEW_SETTINGS))
      .toBe("Review complete. See inline comments for any actionable findings.")
  })

  test("keeps heading-shaped code with its selected section", () => {
    const result = formatReviewSummary("### Findings\n```md\n### Summary\nAn example\n```\n### Summary\nHidden.", {
      ...DEFAULT_REVIEW_SETTINGS,
      includeSummary: false,
    })
    expect(result).toContain("```md\n### Summary\nAn example\n```")
    expect(result).not.toContain("Hidden.")
  })
})

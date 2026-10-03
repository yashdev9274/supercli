import { describe, expect, mock, test } from "bun:test"

import {
  ensureSequenceDiagram,
  extractSequenceDiagram,
} from "./sequence-diagram"
import { parseReviewSections, replaceReviewSection } from "./review-summary"

const diagram =
  "sequenceDiagram\nparticipant Client\nparticipant API\nClient->>API: Send request\nAPI-->>Client: Return response"
const block = `\`\`\`mermaid\n${diagram}\n\`\`\``
const context = {
  title: "Validate requests",
  fileSummary: "src/api.ts",
  diff: "+validateRequest(input)",
}

describe("sequence diagram validation", () => {
  test("accepts a valid sequence diagram in a review section or standalone fence", async () => {
    expect(await extractSequenceDiagram(block)).toBe(diagram)
    expect(
      await extractSequenceDiagram(
        `### Summary\nChecks requests.\n### Sequence Diagram\n${block}\n### Findings\nNone.`,
      ),
    ).toBe(diagram)
  })

  test("rejects missing diagrams, other diagram types, invalid syntax, and init directives", async () => {
    for (const value of [
      "### Summary\nNo diagram.",
      "```mermaid\nflowchart TD\nA-->B\n```",
      "```mermaid\nsequenceDiagram\nClient->>\n```",
      "```mermaid\nsequenceDiagram\n%%{init: {securityLevel: 'loose'}}%%\nClient->>API: Send request\n```",
    ])
      expect(await extractSequenceDiagram(value)).toBeNull()
  })

  test("does not mistake heading-shaped code for an actual diagram section", async () => {
    expect(
      await extractSequenceDiagram(
        "### Findings\n````md\n### Sequence Diagram\n```mermaid\nsequenceDiagram\nClient->>API: Request\n```\n````",
      ),
    ).toBeNull()
  })
})

describe("requested sequence diagrams", () => {
  test("keeps a valid existing diagram without a second model request", async () => {
    const review = `### Summary\nChecks requests.\n### Sequence Diagram\n${block}`
    const generate = mock<(prompt: string) => Promise<string>>(
      async () => block,
    )
    expect(await ensureSequenceDiagram(review, context, generate)).toBe(review)
    expect(generate).not.toHaveBeenCalled()
  })

  test("generates a missing diagram from the actual diff and preserves the review", async () => {
    const review =
      "Review preamble.\n\n### Summary\nChecks requests.\n\n### Findings\nNo blocking issues found."
    const generate = mock<(prompt: string) => Promise<string>>(
      async () => block,
    )
    const result = await ensureSequenceDiagram(review, context, generate)
    expect(result).toStartWith(review)
    expect(result).toContain(`### Sequence Diagram\n\n${block}`)
    expect(generate.mock.calls[0][0]).toContain(context.diff)
    expect(generate.mock.calls[0][0]).toContain(context.fileSummary)
    expect(generate).toHaveBeenCalledTimes(1)
  })

  test("replaces an invalid diagram without losing later sections or CRLF content", async () => {
    const review =
      "Review preamble.\r\n\r\n### Summary\r\nOverview.\r\n  ### Sequence Diagram\r\n```mermaid\r\nsequenceDiagram\r\nClient->>\r\n```\r\n### Findings\r\nConcrete defect."
    const result = await ensureSequenceDiagram(
      review,
      context,
      async () => block,
    )
    expect(result).toStartWith(
      "Review preamble.\r\n\r\n### Summary\r\nOverview.\r\n",
    )
    expect(result).toContain("### Findings\r\nConcrete defect.")
    expect(
      parseReviewSections(result).filter(
        (section) => section.heading === "Sequence Diagram",
      ),
    ).toHaveLength(1)
    expect(await extractSequenceDiagram(result)).toBe(diagram)
  })

  test("reports an unavailable diagram instead of publishing invalid Mermaid or discarding findings", async () => {
    const result = await ensureSequenceDiagram(
      "### Findings\nConcrete defect.",
      context,
      async () => "```mermaid\nsequenceDiagram\nClient->>\n```",
    )
    expect(result).toContain("### Findings\nConcrete defect.")
    expect(result).toContain("A valid sequence diagram could not be generated")
    expect(result).not.toContain("```mermaid")
  })

  test("does not fail the completed review when the additional model request fails", async () => {
    const result = await ensureSequenceDiagram(
      "### Summary\nOverview.",
      context,
      async () => {
        throw new Error("model unavailable")
      },
    )
    expect(result).toContain("### Summary\nOverview.")
    expect(result).toContain("Re-run the review to try again.")
    expect(result).not.toContain("model unavailable")
  })
})

describe("review section replacement", () => {
  test("does not replace a heading inside a code fence", () => {
    const review =
      "Preamble\n### Findings\n```md\n### Sequence Diagram\nexample\n```\n### Sequence Diagram\nold\n### Test plan\nVerify."
    const result = replaceReviewSection(
      review,
      "sequence diagram",
      `### Sequence Diagram\n${block}`,
    )
    expect(result).toContain("```md\n### Sequence Diagram\nexample\n```")
    expect(result).toContain("### Test plan\nVerify.")
    expect(result).not.toContain("\nold\n")
  })
})

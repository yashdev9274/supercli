import { parseReviewSections, replaceReviewSection } from "./review-summary"

export async function extractSequenceDiagram(
  markdown: string,
): Promise<string | null> {
  const section = parseReviewSections(markdown).find(
    (item) => item.heading.toLowerCase() === "sequence diagram",
  )
  const content = section?.content ?? markdown.trim()
  const match = content.match(
    /^(`{3,}|~{3,})mermaid[ \t]*\r?\n([\s\S]*?)\r?\n\1[ \t]*$/i,
  )
  const source = match?.[2]?.trim()
  if (!source || !/^sequenceDiagram\b/.test(source) || source.includes("%%{"))
    return null

  try {
    const { default: mermaid } = await import("mermaid")
    const parsed = await mermaid.parse(source, { suppressErrors: true })
    return parsed && parsed.diagramType === "sequence" ? source : null
  } catch {
    return null
  }
}

export async function ensureSequenceDiagram(
  review: string,
  context: { title: string; fileSummary: string; diff: string },
  generate: (prompt: string) => Promise<string>,
): Promise<string> {
  const existing = await extractSequenceDiagram(review)
  if (existing) return review

  const prompt = `Generate a Mermaid sequence diagram for this pull request.
Return ONLY one fenced mermaid code block starting with sequenceDiagram. No headings or prose.
Use only participants and interactions evidenced by the changes below. Describe the changed interaction, not the entire application.
Use simple participant identifiers with readable aliases, quote labels when needed, and use valid Mermaid syntax. Do not include init directives, HTML, links, or JavaScript.
For changes with no runtime interaction, show the relevant author-to-artifact change rather than inventing a runtime flow.

PR title: ${context.title}
Changed files:
${context.fileSummary}

Diff:
\`\`\`diff
${context.diff}
\`\`\`

Review context:
${review.slice(0, 24000)}`

  let diagram: string | null = null
  try {
    diagram = await extractSequenceDiagram(await generate(prompt))
  } catch {
    diagram = null
  }

  const section = diagram
    ? `### Sequence Diagram\n\n\`\`\`mermaid\n${diagram}\n\`\`\``
    : "### Sequence Diagram\n\nA valid sequence diagram could not be generated for this review. Re-run the review to try again."
  return replaceReviewSection(review, "Sequence Diagram", section)
}

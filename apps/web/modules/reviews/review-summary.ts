import type { ReviewSettings } from "./review-settings"

export type ReviewSection = {
  heading: string
  content: string
  markdown: string
  start: number
  end: number
}

const SUMMARY_HEADINGS = new Set([
  "summary",
  "walkthrough",
  "changes table",
  "risk assessment",
  "test plan",
  "suggested pr description",
])

const SECTION_HEADINGS = new Set([
  ...SUMMARY_HEADINGS,
  "pr description summary",
  "findings",
  "confidence score",
  "sequence diagram",
])

export function parseReviewSections(review: string): ReviewSection[] {
  const sections: ReviewSection[] = []
  let heading = ""
  let headingLine = ""
  let content: string[] = []
  let fence: { character: string; length: number } | null = null
  let offset = 0
  let sectionStart = 0

  const finishSection = (end: number) => {
    if (!heading) return
    const body = content.join("\n").trim()
    sections.push({
      heading,
      content: body,
      markdown: `${headingLine}\n${content.join("\n")}`.trim(),
      start: sectionStart,
      end,
    })
  }

  for (const line of review.split(/\r?\n/)) {
    const lineStart = offset
    offset += line.length
    if (review[offset] === "\r") offset += 1
    if (review[offset] === "\n") offset += 1
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/)
    if (fence) {
      content.push(line)
      if (
        delimiter &&
        delimiter[1][0] === fence.character &&
        delimiter[1].length >= fence.length &&
        !delimiter[2].trim()
      ) {
        fence = null
      }
      continue
    }
    if (delimiter) {
      fence = { character: delimiter[1][0], length: delimiter[1].length }
      content.push(line)
      continue
    }

    const match = line.match(/^ {0,3}#{1,3}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/)
    if (
      !match ||
      (heading && !SECTION_HEADINGS.has(match[1].trim().toLowerCase()))
    ) {
      content.push(line)
      continue
    }

    finishSection(lineStart)
    sectionStart = lineStart
    heading = match[1].trim()
    headingLine = line.trim()
    content = []
  }
  finishSection(review.length)
  return sections
}

export function replaceReviewSection(
  review: string,
  heading: string,
  markdown: string,
): string {
  const section = parseReviewSections(review).find(
    (item) => item.heading.toLowerCase() === heading.toLowerCase(),
  )
  if (!section) return `${review.trimEnd()}\n\n${markdown.trim()}`.trim()
  return `${review.slice(0, section.start)}${markdown.trim()}\n\n${review.slice(section.end)}`.trimEnd()
}

function collapsibleBlock(
  content: string,
  label: string,
  open: boolean,
): string {
  return [
    open ? "<details open>" : "<details>",
    `<summary>${label}</summary>`,
    "",
    content,
    "",
    "</details>",
  ].join("\n")
}

export function formatReviewSummary(
  review: string,
  settings: ReviewSettings,
): string {
  const sections = parseReviewSections(review)
  const summarySections = sections.filter(
    (section) =>
      SUMMARY_HEADINGS.has(section.heading.toLowerCase()) && section.content,
  )
  const blocks: string[] = []
  let summaryAdded = false

  for (const section of sections) {
    if (!section.content) continue
    const heading = section.heading.toLowerCase()
    if (SUMMARY_HEADINGS.has(heading)) {
      if (!settings.includeSummary) continue
      if (!settings.summaryCollapsible) {
        blocks.push(section.markdown)
        continue
      }
      if (!summaryAdded) {
        blocks.push(
          collapsibleBlock(
            summarySections.map((item) => item.markdown).join("\n\n"),
            "Summary",
            settings.summaryDefaultOpen,
          ),
        )
        summaryAdded = true
      }
      continue
    }
    if (heading === "findings" && settings.includeFindings) {
      blocks.push(section.markdown)
    }
    if (heading === "confidence score" && settings.includeConfidence) {
      blocks.push(section.markdown)
    }
    if (heading === "sequence diagram" && settings.includeSequenceDiagram) {
      blocks.push(
        settings.diagramCollapsible
          ? collapsibleBlock(
              section.markdown,
              "Sequence diagram",
              settings.diagramDefaultOpen,
            )
          : section.markdown,
      )
    }
  }

  return (
    blocks.join("\n\n") ||
    "Review complete. See inline comments for any actionable findings."
  )
}

import type { NovaReference, ReferenceKind } from "@/modules/nova/references/contracts"

export const MAX_REFERENCES = 10

export const REFERENCE_CATEGORIES: { kind: ReferenceKind; label: string; description: string }[] = [
  { kind: "people", label: "People", description: "Tag someone in the org" },
  { kind: "threads", label: "Threads", description: "Reference another thread" },
  { kind: "pull_requests", label: "Pull requests", description: "Open and recent pull requests" },
  { kind: "skills", label: "Skills", description: "Skills available to the agent" },
  { kind: "devices", label: "Devices", description: "Your paired computers" },
  { kind: "files", label: "Files", description: "Source files in connected repos" },
]

export type MentionQuery = {
  start: number
  end: number
  query: string
}

function isMentionBoundary(character: string): boolean {
  return /[\s([{]/u.test(character)
}

export function parseMentionQuery(
  value: string,
  selectionStart: number,
  selectionEnd = selectionStart,
): MentionQuery | null {
  if (selectionStart !== selectionEnd || selectionStart < 0 || selectionStart > value.length) return null
  const start = value.lastIndexOf("@", selectionStart - 1)
  if (start < 0 || start >= selectionStart) return null
  if (start > 0 && !isMentionBoundary(value[start - 1]!)) return null
  const query = value.slice(start + 1, selectionStart)
  if (/[\r\n@]/u.test(query)) return null
  return { start, end: selectionStart, query }
}

export function filterReferenceCategories(query: string): typeof REFERENCE_CATEGORIES {
  const search = query.trim().toLowerCase().replaceAll("_", " ")
  if (!search) return REFERENCE_CATEGORIES
  return REFERENCE_CATEGORIES.filter((category) =>
    `${category.label} ${category.description}`.toLowerCase().includes(search),
  )
}

export function replaceMentionQuery(
  value: string,
  mention: MentionQuery,
  replacement: string,
): { value: string; caret: number } {
  return {
    value: value.slice(0, mention.start) + replacement + value.slice(mention.end),
    caret: mention.start + replacement.length,
  }
}

export function insertMentionTrigger(
  value: string,
  selectionStart: number,
  selectionEnd = selectionStart,
): { value: string; caret: number } {
  const start = Math.max(0, Math.min(selectionStart, value.length))
  const end = Math.max(start, Math.min(selectionEnd, value.length))
  const separator = start > 0 && !isMentionBoundary(value[start - 1]!) ? " " : ""
  const replacement = `${separator}@`
  return {
    value: value.slice(0, start) + replacement + value.slice(end),
    caret: start + replacement.length,
  }
}

export function addReference(
  references: NovaReference[],
  reference: NovaReference,
): { references: NovaReference[]; status: "added" | "duplicate" | "limit" } {
  if (references.some((item) => item.kind === reference.kind && item.id === reference.id)) {
    return { references, status: "duplicate" }
  }
  if (references.length >= MAX_REFERENCES) return { references, status: "limit" }
  return { references: [...references, reference], status: "added" }
}

export function moveMentionIndex(index: number, direction: number, count: number): number {
  if (count === 0) return 0
  return (Math.min(index, count - 1) + direction + count) % count
}

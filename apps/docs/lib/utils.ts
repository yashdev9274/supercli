import type React from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function slugify(text: string): string {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "section"
}

export type TocHeading = { level: 2 | 3; text: string; id: string }

/** Get plain text from React children for heading slug ids */
export function getHeadingText(children: React.ReactNode): string {
  if (typeof children === "string") return children
  if (typeof children === "number") return String(children)
  if (Array.isArray(children)) return children.map(getHeadingText).join("")
  if (children && typeof children === "object" && "props" in children) {
    return getHeadingText((children as React.ReactElement<{ children?: React.ReactNode }>).props.children)
  }
  return ""
}

export function extractHeadings(content: string): TocHeading[] {
  const headings: TocHeading[] = []
  const lines = content.split("\n")
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/)
    const h3 = line.match(/^###\s+(.+)$/)
    if (h2) {
      const text = h2[1].trim()
      headings.push({ level: 2, text, id: slugify(text) })
    } else if (h3) {
      const text = h3[1].trim()
      headings.push({ level: 3, text, id: slugify(text) })
    }
  }
  return headings
}

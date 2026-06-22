import fs from "fs"
import path from "path"
import matter from "gray-matter"
import { DOCS_NAV, type NavSection } from "./docs-nav"

const CONTENT_DIR = path.join(process.cwd(), "content/docs")

function getFilesRecursively(dir: string): string[] {
  if (!fs.existsSync(dir)) return []

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  let files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files = [...files, ...getFilesRecursively(fullPath)]
    } else if (entry.name.endsWith(".mdx")) {
      files.push(fullPath)
    }
  }

  return files
}

export function getDocSlugs(): string[] {
  const files = getFilesRecursively(CONTENT_DIR)
  return files.map((f) => {
    const relativePath = path.relative(CONTENT_DIR, f)
    return relativePath.replace(/\.mdx$/, "").replace(/\\/g, "/")
  })
}

export function getDocBySlug(
  slug: string
): { content: string; meta: Record<string, unknown> } | null {
  const filePath = path.join(CONTENT_DIR, `${slug}.mdx`)
  if (!fs.existsSync(filePath)) return null
  const raw = fs.readFileSync(filePath, "utf-8")
  const { content, data } = matter(raw)
  return { content, meta: data as Record<string, unknown> }
}

export function getNavSlugs(): string[] {
  return DOCS_NAV.flatMap((s) => s.items.map((i) => i.slug))
}

export function getPrevNext(
  slug: string
): { prev: { title: string; slug: string } | null; next: { title: string; slug: string } | null } {
  const all = getNavSlugs()
  const idx = all.indexOf(slug)
  if (idx === -1) return { prev: null, next: null }
  return {
    prev: idx > 0 ? { title: getTitle(all[idx - 1]), slug: all[idx - 1] } : null,
    next: idx < all.length - 1 ? { title: getTitle(all[idx + 1]), slug: all[idx + 1] } : null,
  }
}

export function getTitle(slug: string): string {
  for (const section of DOCS_NAV) {
    const item = section.items.find((i) => i.slug === slug)
    if (item) return item.title
  }
  return slug
}

export { DOCS_NAV }
export type { NavSection }

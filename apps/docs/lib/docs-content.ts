import fs from "fs"
import path from "path"
import matter from "gray-matter"
import { DOCS_NAV } from "./docs-nav"

const CONTENT_DIR = path.join(process.cwd(), "content/docs")

export function getDocSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return []
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => f.replace(/\.mdx$/, ""))
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

export { DOCS_NAV }

import fs from "fs"
import path from "path"
import matter from "gray-matter"
import { DOCS_NAV } from "./docs-nav"

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

export { DOCS_NAV }

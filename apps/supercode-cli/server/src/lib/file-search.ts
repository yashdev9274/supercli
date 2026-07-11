import fs from "node:fs/promises"
import path from "node:path"

const ALWAYS_IGNORE = new Set([
  "node_modules", ".next", "dist", "build", ".git",
  ".cache", "coverage", ".turbo", "out", ".expo",
  "android", "ios", ".venv", "venv", "__pycache__",
  "target", "bin", "obj", ".vercel", ".serverless",
  ".env", ".env.local",
])

export interface FileEntry {
  name: string
  path: string
  relativePath: string
}

let fileIndex: FileEntry[] = []
let filePathSet = new Set<string>()
let indexedRoot = ""

function isIgnored(entry: string): boolean {
  if (ALWAYS_IGNORE.has(entry)) return true
  if (entry.startsWith(".") && entry !== ".") return true
  return false
}

export async function walkDir(
  dir: string,
  depth = 0,
  maxDepth = 8,
): Promise<FileEntry[]> {
  if (depth > maxDepth) return []
  const entries: FileEntry[] = []
  try {
    const dirEntries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of dirEntries) {
      if (isIgnored(entry.name)) continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const sub = await walkDir(fullPath, depth + 1, maxDepth)
        entries.push(...sub)
      } else if (entry.isFile()) {
        entries.push({
          name: entry.name,
          path: fullPath,
          relativePath: "",
        })
      }
    }
  } catch {}
  return entries
}

export async function indexWorkspace(
  root: string,
): Promise<FileEntry[]> {
  indexedRoot = root
  fileIndex = await walkDir(root)
  filePathSet = new Set(fileIndex.map((f) => f.path))
  for (const f of fileIndex) {
    f.relativePath = path.relative(root, f.path)
  }
  return fileIndex
}

function scoreFuzzy(query: string, target: string): number {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  if (qi !== q.length) return -1

  let score = 0
  let lastMatch = -2
  qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      if (ti === lastMatch + 1) score += 10
      else score += 5
      if (ti === 0 || t[ti - 1] === "/" || t[ti - 1] === "_" || t[ti - 1] === "-") score += 20
      lastMatch = ti
      qi++
    }
  }
  return score
}

export function searchFiles(query: string, limit = 15): FileEntry[] {
  if (!fileIndex.length) return []

  if (!query) {
    const sorted = [...fileIndex].sort((a, b) => {
      const aDepth = a.relativePath.split("/").length
      const bDepth = b.relativePath.split("/").length
      if (aDepth !== bDepth) return aDepth - bDepth
      return a.relativePath.localeCompare(b.relativePath)
    })
    return sorted.slice(0, limit)
  }

  const scored = fileIndex
    .map((f) => ({
      entry: f,
      score: scoreFuzzy(query, f.relativePath || f.name),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map((s) => s.entry)
}

export function findDragDropPaths(
  input: string,
  workspaceRoot: string,
): string[] {
  if (!input || !filePathSet.size) return []
  const found: string[] = []
  for (const fp of filePathSet) {
    if (input.includes(fp)) {
      found.push(fp)
    }
  }
  return found
}

export async function resolveFileReferences(
  input: string,
  workspaceRoot?: string,
  extraPaths?: string[],
): Promise<{ content: Record<string, string>; unresolved: string[] }> {
  const content: Record<string, string> = {}
  const unresolved: string[] = []
  const seen = new Set<string>()

  const tryAdd = async (filePath: string) => {
    if (seen.has(filePath)) return
    seen.add(filePath)
    try {
      const resolved = workspaceRoot
        ? path.resolve(workspaceRoot, filePath)
        : path.resolve(filePath)
      const stat = await fs.stat(resolved)
      if (stat.isFile() && stat.size < 512 * 1024) {
        const data = await fs.readFile(resolved, "utf-8")
        content[resolved] = data
      } else {
        unresolved.push(filePath)
      }
    } catch {
      unresolved.push(filePath)
    }
  }

  const refs = input.match(/@\S+/g)
  if (refs) {
    for (const ref of refs) {
      let filePath = ref.slice(1).replace(/[,.!?;:)]+$/, "")
      if (filePath.startsWith("/")) filePath = filePath.slice(1)
      await tryAdd(filePath)
    }
  }

  if (extraPaths) {
    for (const p of extraPaths) {
      await tryAdd(p)
    }
  }

  return { content, unresolved }
}

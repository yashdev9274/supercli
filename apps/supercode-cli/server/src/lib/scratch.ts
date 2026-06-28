import { mkdir, writeFile, readdir, readFile, unlink, rm, stat } from "node:fs/promises"
import path from "node:path"

export const SCRATCH_DIR = ".super/scratch"

export interface ScratchEntry {
  name: string
  path: string
  size: number
  createdAt: Date
}

/**
 * Return the absolute scratch directory for the current workspace.
 * Creates `.super/scratch/` if missing.
 */
export async function scratchDir(): Promise<string> {
  const root = process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()
  const dir = path.join(root, SCRATCH_DIR)
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * Write a JSON payload to the scratch dir. Returns the path relative to
 * the workspace root.
 */
export async function writeScratch(
  prefix: string,
  body: unknown,
): Promise<string> {
  const dir = await scratchDir()
  const filename = `${prefix}-${Date.now()}.json`
  const file = path.join(dir, filename)
  await writeFile(file, JSON.stringify(body, null, 2), "utf-8")
  const root = process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()
  return path.relative(root, file)
}

/**
 * Write a markdown payload (e.g. plan output) to the scratch dir.
 */
export async function writeScratchMarkdown(
  prefix: string,
  body: string,
): Promise<string> {
  const dir = await scratchDir()
  const filename = `${prefix}-${Date.now()}.md`
  const file = path.join(dir, filename)
  await writeFile(file, body, "utf-8")
  const root = process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()
  return path.relative(root, file)
}

/**
 * List scratch entries with metadata. Newest first.
 */
export async function listScratch(): Promise<ScratchEntry[]> {
  const dir = await scratchDir()
  const entries = await readdir(dir, { withFileTypes: true })
  const items: ScratchEntry[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const file = path.join(dir, entry.name)
    const stats = await stat(file)
    items.push({
      name: entry.name,
      path: file,
      size: stats.size,
      createdAt: stats.mtime,
    })
  }
  items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  return items
}

/**
 * Read a scratch entry by name.
 */
export async function readScratch(name: string): Promise<string | null> {
  const dir = await scratchDir()
  const file = path.join(dir, name)
  try {
    return await readFile(file, "utf-8")
  } catch {
    return null
  }
}

/**
 * Find the most recent scratch file matching a prefix.
 */
export async function latestScratch(prefix: string): Promise<ScratchEntry | null> {
  const items = await listScratch()
  return items.find((it) => it.name.startsWith(prefix)) ?? null
}

/**
 * Delete a single scratch entry.
 */
export async function deleteScratch(name: string): Promise<boolean> {
  const dir = await scratchDir()
  const file = path.join(dir, name)
  try {
    await unlink(file)
    return true
  } catch {
    return false
  }
}

/**
 * Clear all scratch entries.
 */
export async function clearScratch(): Promise<number> {
  const dir = await scratchDir()
  try {
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    return 0
  } catch {
    return 0
  }
}
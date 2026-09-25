import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readdir, lstat } from "node:fs/promises"
import { relative, join } from "node:path"
import { resolvePath } from "./workspace"

export const execFileAsync = promisify(execFile)
const excluded = new Set([".git", "node_modules", ".next", "dist", "build", "coverage", ".turbo", ".venv", "venv", "__pycache__"])
function eligible(file: string): boolean {
  return !file.split("/").some((part) => excluded.has(part) || part === ".env" || (part.startsWith(".env.") && part !== ".env.example"))
}

export async function discoverFiles(signal?: AbortSignal): Promise<{ files: string[]; truncated: boolean }> {
  const root = resolvePath(".")
  try {
    const { stdout } = await execFileAsync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root, encoding: "utf8", maxBuffer: 8_000_000, timeout: 15000, signal,
    })
    const candidates = [...new Set(stdout.split("\0").filter((p) => p && eligible(p)))].sort()
    const files: string[] = []
    for (const file of candidates.slice(0, 10000)) {
      signal?.throwIfAborted()
      try { if ((await lstat(resolvePath(file))).isFile()) files.push(file) } catch { /* deleted or external symlink */ }
    }
    return { files, truncated: candidates.length > 10000 }
  } catch (error) {
    signal?.throwIfAborted()
    const code = (error as NodeJS.ErrnoException).code
    if (code !== "ENOENT" && !String((error as { stderr?: string }).stderr).includes("not a git repository")) throw error
  }
  const files: string[] = []
  let visited = 0
  let truncated = false
  async function walk(dir: string, depth: number): Promise<void> {
    signal?.throwIfAborted()
    if (depth > 40 || visited >= 20000) { truncated = true; return }
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (++visited > 20000) { truncated = true; break }
      const full = join(dir, entry.name)
      if (!eligible(relative(root, full))) continue
      if (entry.isDirectory()) await walk(full, depth + 1)
      else if (entry.isFile()) files.push(relative(root, full))
    }
  }
  await walk(root, 0)
  return { files: files.sort(), truncated }
}

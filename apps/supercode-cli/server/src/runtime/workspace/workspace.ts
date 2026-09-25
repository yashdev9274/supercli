import { resolve, relative, isAbsolute, dirname, basename, sep } from "node:path"
import { realpathSync, lstatSync } from "node:fs"
import { access } from "node:fs/promises"

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkspaceError"
  }
}

function getRoot(): string {
  return process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()
}

export function resolvePath(filePath: string): string {
  const root = realpathSync(resolve(getRoot()))
  const full = resolve(root, filePath)
  const inside = (target: string) => {
    const rel = relative(root, target)
    return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
  }
  if (!inside(full)) throw new WorkspaceError(`Path "${filePath}" is outside workspace root`)

  // Resolve existing ancestors too: a new file may live below a symlink.
  let ancestor = full
  const missing: string[] = []
  while (true) {
    try {
      const canonical = resolve(realpathSync(ancestor), ...missing)
      if (!inside(canonical)) throw new WorkspaceError(`Path "${filePath}" resolves outside workspace root`)
      return canonical
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      if (ancestor === root) throw error
      // A dangling link is not a missing path component we can safely create.
      if (lstatSync(ancestor, { throwIfNoEntry: false })?.isSymbolicLink()) {
        throw new WorkspaceError(`Path "${filePath}" contains a dangling symlink`)
      }
      missing.unshift(basename(ancestor))
      ancestor = dirname(ancestor)
    }
  }
}

export function assertNoBinary(content: string, label: string): void {
  if (content.includes("\0")) {
    throw new WorkspaceError(`"${label}" contains binary content`)
  }
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

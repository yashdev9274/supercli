import { resolve } from "node:path"
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
  const root = getRoot()
  const full = resolve(root, filePath)
  if (!full.startsWith(root)) {
    throw new WorkspaceError(`Path "${filePath}" is outside workspace root`)
  }
  return full
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

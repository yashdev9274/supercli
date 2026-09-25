import { createHash, randomUUID } from "node:crypto"
import { mkdir, open, rename, unlink, chmod } from "node:fs/promises"
import { dirname } from "node:path"
import { assertNoBinary, resolvePath, WorkspaceError } from "./workspace"

export const MAX_TEXT_BYTES = 1_000_000
const locks = new Map<string, Promise<void>>()

export function contentVersion(content: string): string {
  return createHash("sha256").update(content).digest("hex")
}

export async function readText(filePath: string): Promise<{ content: string; mode: number }> {
  const handle = await open(resolvePath(filePath), "r")
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new WorkspaceError("Expected a regular file")
    if (stat.size > MAX_TEXT_BYTES) throw new WorkspaceError("File exceeds 1MB text limit; narrow the task using search or a command")
    const buffer = Buffer.alloc(MAX_TEXT_BYTES + 1)
    let length = 0
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null)
      if (!bytesRead) break
      length += bytesRead
    }
    if (length > MAX_TEXT_BYTES) throw new WorkspaceError("File exceeds 1MB text limit")
    const content = buffer.subarray(0, length).toString("utf8")
    assertNoBinary(content, filePath)
    return { content, mode: stat.mode }
  } finally {
    await handle.close()
  }
}

export async function updateText(
  filePath: string,
  transform: (original: string | null) => string,
  expectedVersion?: string,
): Promise<{ created: boolean; version: string; size: number }> {
  const full = resolvePath(filePath)
  const previous = locks.get(full) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  locks.set(full, current)
  await previous
  try {
    let original: string | null = null
    let mode = 0o644
    try {
      const existing = await readText(filePath)
      original = existing.content
      mode = existing.mode & 0o777
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    }
    if (expectedVersion !== undefined && (original === null || contentVersion(original) !== expectedVersion)) {
      throw new WorkspaceError("File changed since it was read. Re-read before editing.")
    }
    const content = transform(original)
    assertNoBinary(content, filePath)
    const size = Buffer.byteLength(content)
    if (size > MAX_TEXT_BYTES) throw new WorkspaceError("File exceeds 1MB text limit")
    await mkdir(dirname(full), { recursive: true })
    resolvePath(filePath)
    const temporary = `${full}.${randomUUID()}.tmp`
    try {
      const handle = await open(temporary, "wx", 0o600)
      try {
        await handle.writeFile(content, "utf8")
      } finally {
        await handle.close()
      }
      await chmod(temporary, mode)
      resolvePath(filePath)
      await rename(temporary, full)
    } finally {
      await unlink(temporary).catch(() => {})
    }
    return { created: original === null, version: contentVersion(content), size }
  } finally {
    release()
    if (locks.get(full) === current) locks.delete(full)
  }
}

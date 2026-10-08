/**
 * Client-side local folder workspace for Nova web.
 *
 * Browsers cannot freely scan the disk. Once the user grants a folder via the
 * File System Access API, we index paths in-memory (and persist the handle in
 * IndexedDB) so @ Files can search local machine files the way Nova desktop does.
 */

import { classifyLocalFile, sanitizeFileName } from "@/modules/nova/attachments/contracts"
import type { NovaReference } from "@/modules/nova/references/contracts"
import {
  createLocalProject,
  updateLocalProject,
  type LocalProjectDto,
} from "@/modules/nova-web/api"
import { readLocalFile, type LocalFileReadResult } from "@/modules/nova-web/local-files"

export const LOCAL_FILE_ID_PREFIX = "local:"
export const MAX_LOCAL_INDEX_FILES = 4_000
export const MAX_LOCAL_WALK_DEPTH = 8

const SKIP_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", "coverage",
  ".turbo", ".cache", ".vercel", "vendor", "target", "Pods", ".gradle",
  "__pycache__", ".venv", "venv", ".idea", ".vscode", "DerivedData",
])

type FileSystemFileHandleLike = {
  kind: "file"
  name: string
  getFile: () => Promise<File>
}

type FileSystemDirectoryHandleLike = {
  kind: "directory"
  name: string
  values: () => AsyncIterableIterator<FileSystemFileHandleLike | FileSystemDirectoryHandleLike>
  getDirectoryHandle?: (name: string, options?: { create?: boolean }) => Promise<FileSystemDirectoryHandleLike>
  getFileHandle?: (name: string) => Promise<FileSystemFileHandleLike>
  queryPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>
  requestPermission?: (descriptor?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>
}

export type LocalWorkspaceEntry = {
  path: string
  name: string
  kind: "text" | "image" | "document" | "other"
}

export type LocalWorkspaceState = {
  projectId: string | null
  displayName: string
  rootName: string
  entries: LocalWorkspaceEntry[]
  truncated: boolean
  indexedAt: number
}

type IndexedDBHandleRecord = {
  id: string
  projectId: string | null
  rootName: string
  handle: FileSystemDirectoryHandleLike
  indexedAt: number
}

let memoryState: LocalWorkspaceState | null = null
let memoryHandle: FileSystemDirectoryHandleLike | null = null
let pathHandleCache = new Map<string, FileSystemFileHandleLike>()
const ACTIVE_HANDLE_ID = "active"

function supportsDirectoryPicker(): boolean {
  return typeof window !== "undefined" && typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === "function"
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("nova-local-workspace", 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles", { keyPath: "id" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"))
  })
}

async function saveHandle(
  rootName: string,
  handle: FileSystemDirectoryHandleLike,
  projectId: string | null,
) {
  try {
    const db = await openHandleDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite")
      tx.objectStore("handles").put({
        id: ACTIVE_HANDLE_ID,
        projectId,
        rootName,
        handle,
        indexedAt: Date.now(),
      } satisfies IndexedDBHandleRecord)
      if (projectId) {
        tx.objectStore("handles").put({
          id: `project:${projectId}`,
          projectId,
          rootName,
          handle,
          indexedAt: Date.now(),
        } satisfies IndexedDBHandleRecord)
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error("Failed to persist folder handle"))
    })
    db.close()
  } catch {
    // Persistence is best-effort; in-memory index still works this session.
  }
}

async function loadPersistedHandle(projectId?: string | null): Promise<IndexedDBHandleRecord | null> {
  try {
    const db = await openHandleDb()
    const key = projectId ? `project:${projectId}` : ACTIVE_HANDLE_ID
    const record = await new Promise<IndexedDBHandleRecord | null>((resolve, reject) => {
      const tx = db.transaction("handles", "readonly")
      const req = tx.objectStore("handles").get(key)
      req.onsuccess = () => resolve((req.result as IndexedDBHandleRecord | undefined) ?? null)
      req.onerror = () => reject(req.error ?? new Error("Failed to read folder handle"))
    })
    db.close()
    if (record) return record
    if (projectId) {
      // Fall back to active handle if it matches.
      const active = await loadPersistedHandle(null)
      if (active?.projectId === projectId) return active
    }
    return null
  } catch {
    return null
  }
}

async function ensurePermission(handle: FileSystemDirectoryHandleLike): Promise<boolean> {
  try {
    if (handle.queryPermission) {
      const state = await handle.queryPermission({ mode: "read" })
      if (state === "granted") return true
    }
    if (handle.requestPermission) {
      const state = await handle.requestPermission({ mode: "read" })
      return state === "granted"
    }
    return true
  } catch {
    return false
  }
}

function classifyPath(path: string): LocalWorkspaceEntry["kind"] {
  const name = path.split("/").pop() || path
  const kind = classifyLocalFile(name, null)
  return kind ?? "other"
}

async function walkDirectory(
  dir: FileSystemDirectoryHandleLike,
  prefix: string,
  depth: number,
  out: LocalWorkspaceEntry[],
  handleCache: Map<string, FileSystemFileHandleLike>,
): Promise<boolean> {
  if (out.length >= MAX_LOCAL_INDEX_FILES) return true
  if (depth > MAX_LOCAL_WALK_DEPTH) return false

  for await (const entry of dir.values()) {
    if (out.length >= MAX_LOCAL_INDEX_FILES) return true
    const name = entry.name
    if (!name || name.startsWith(".")) {
      // Allow common dotfiles like .env.example? Skip hidden by default except .gitignore etc handled below
      if (!(name === ".env.example" || name === ".gitignore" || name === ".editorconfig")) continue
    }
    if (entry.kind === "directory") {
      if (SKIP_DIRS.has(name)) continue
      const nextPrefix = prefix ? `${prefix}/${name}` : name
      const truncated = await walkDirectory(
        entry as FileSystemDirectoryHandleLike,
        nextPrefix,
        depth + 1,
        out,
        handleCache,
      )
      if (truncated) return true
      continue
    }

    const path = prefix ? `${prefix}/${name}` : name
    const kind = classifyPath(path)
    if (kind === "other") continue
    out.push({ path, name, kind })
    handleCache.set(path, entry as FileSystemFileHandleLike)
  }
  return false
}

export async function indexDirectoryHandle(
  handle: FileSystemDirectoryHandleLike,
  options?: { projectId?: string | null; displayName?: string; persistRemote?: boolean },
): Promise<LocalWorkspaceState> {
  const entries: LocalWorkspaceEntry[] = []
  const cache = new Map<string, FileSystemFileHandleLike>()
  const truncated = await walkDirectory(handle, "", 0, entries, cache)
  entries.sort((a, b) => a.path.localeCompare(b.path))
  memoryHandle = handle
  pathHandleCache = cache

  const rootName = handle.name || "Local folder"
  const displayName = options?.displayName?.trim() || rootName
  let projectId = options?.projectId ?? memoryState?.projectId ?? null

  if (options?.persistRemote !== false) {
    try {
      const paths = entries.map((entry) => entry.path)
      let project: LocalProjectDto
      if (projectId) {
        const updated = await updateLocalProject(projectId, {
          displayName,
          paths,
          truncated,
        })
        project = updated.project
      } else {
        const created = await createLocalProject({
          displayName,
          rootName,
          paths,
          truncated,
        })
        project = created.project
      }
      projectId = project.id
    } catch (error) {
      console.warn("[nova/local-workspace] failed to persist project index", error)
    }
  }

  memoryState = {
    projectId,
    displayName,
    rootName,
    entries,
    truncated,
    indexedAt: Date.now(),
  }
  await saveHandle(memoryState.rootName, handle, projectId)
  return memoryState
}

export async function pickLocalWorkspaceFolder(options?: {
  displayName?: string
}): Promise<LocalWorkspaceState | null> {
  if (!supportsDirectoryPicker()) {
    throw new Error(
      "This browser can't grant folder access. Use Chrome/Edge, or attach individual files with + / paste / drag-and-drop.",
    )
  }
  const anyWindow = window as unknown as {
    showDirectoryPicker: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandleLike>
  }
  let handle: FileSystemDirectoryHandleLike
  try {
    handle = await anyWindow.showDirectoryPicker({ mode: "read" })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null
    throw error
  }
  const allowed = await ensurePermission(handle)
  if (!allowed) throw new Error("Folder permission was denied")
  // New folder grant creates/updates a DB-backed project for this user.
  return indexDirectoryHandle(handle, {
    projectId: null,
    displayName: options?.displayName,
    persistRemote: true,
  })
}

export async function restoreLocalWorkspace(projectId?: string | null): Promise<LocalWorkspaceState | null> {
  if (memoryState && memoryHandle && (!projectId || memoryState.projectId === projectId)) {
    return memoryState
  }
  const record = await loadPersistedHandle(projectId)
  if (!record?.handle) return null
  const allowed = await ensurePermission(record.handle)
  if (!allowed) return null
  return indexDirectoryHandle(record.handle, {
    projectId: record.projectId ?? projectId ?? null,
    // Re-index and refresh path list in DB when restoring.
    persistRemote: true,
  })
}

export function getLocalWorkspace(): LocalWorkspaceState | null {
  return memoryState
}

export function getActiveLocalProjectId(): string | null {
  return memoryState?.projectId ?? null
}

export function clearLocalWorkspace() {
  memoryState = null
  memoryHandle = null
  pathHandleCache = new Map()
  void openHandleDb().then((db) => {
    const tx = db.transaction("handles", "readwrite")
    tx.objectStore("handles").delete(ACTIVE_HANDLE_ID)
    db.close()
  }).catch(() => {})
}

export function isLocalFileReferenceId(id: string): boolean {
  return id.startsWith(LOCAL_FILE_ID_PREFIX)
}

export function localPathFromReferenceId(id: string): string | null {
  if (!isLocalFileReferenceId(id)) return null
  return id.slice(LOCAL_FILE_ID_PREFIX.length)
}

export function localFileReference(entry: LocalWorkspaceEntry, rootName: string, projectId?: string | null): NovaReference {
  return {
    kind: "files",
    id: `${LOCAL_FILE_ID_PREFIX}${entry.path}`,
    label: entry.path,
    description: projectId ? `Local · ${rootName}` : `Local · ${rootName}`,
  }
}

export function searchLocalWorkspaceFiles(query: string, limit = 40): NovaReference[] {
  const state = memoryState
  if (!state) return []
  const q = query.trim().toLowerCase()
  const matched = q
    ? state.entries.filter((entry) =>
      entry.path.toLowerCase().includes(q)
      || entry.name.toLowerCase().includes(q),
    )
    : state.entries
  return matched.slice(0, limit).map((entry) => localFileReference(entry, state.displayName || state.rootName, state.projectId))
}

async function resolveHandleForPath(path: string): Promise<FileSystemFileHandleLike | null> {
  const cached = pathHandleCache.get(path)
  if (cached) return cached
  if (!memoryHandle) return null

  const parts = path.split("/").filter(Boolean)
  let dir: FileSystemDirectoryHandleLike = memoryHandle
  for (let i = 0; i < parts.length - 1; i += 1) {
    const part = parts[i]!
    if (!dir.getDirectoryHandle) return null
    dir = await dir.getDirectoryHandle(part)
  }
  const fileName = parts.at(-1)
  if (!fileName || !dir.getFileHandle) return null
  const handle = await dir.getFileHandle(fileName)
  pathHandleCache.set(path, handle)
  return handle
}

export async function readLocalWorkspaceFile(path: string): Promise<LocalFileReadResult> {
  try {
    const handle = await resolveHandleForPath(path)
    if (!handle) {
      return { ok: false, name: sanitizeFileName(path), error: "Local file is no longer available. Re-open the folder." }
    }
    const file = await handle.getFile()
    // Preserve relative path in the attachment name for agent context.
    const result = await readLocalFile(file)
    if (!result.ok) return result
    return {
      ok: true,
      attachment: {
        ...result.attachment,
        name: path.replaceAll("\\", "/"),
      },
    }
  } catch (error) {
    return {
      ok: false,
      name: sanitizeFileName(path),
      error: error instanceof Error ? error.message : "Could not read local file",
    }
  }
}

export function localWorkspaceSupportsPicker(): boolean {
  return supportsDirectoryPicker()
}

export function localWorkspaceStatusMessage(): string | undefined {
  const state = memoryState
  if (!state) {
    return supportsDirectoryPicker()
      ? "No local project linked. Open a folder to work on a local project (saved to your Nova workspace), or attach files with +."
      : "This browser can't index a local folder. Attach files with +, paste, or drag-and-drop."
  }
  const count = state.entries.length
  const saved = state.projectId ? "saved" : "session-only"
  const base = `Local project · ${state.displayName || state.rootName} · ${count} file${count === 1 ? "" : "s"} · ${saved}`
  return state.truncated ? `${base} (partial — folder is large)` : base
}

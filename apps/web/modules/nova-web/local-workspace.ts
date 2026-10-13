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
  getFileHandle?: (name: string, options?: { create?: boolean }) => Promise<FileSystemFileHandleLike>
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
/** Paths from a DB/GitHub project when no folder handle is available. */
let virtualProject: {
  projectId: string
  displayName: string
  rootName: string
  paths: string[]
  repositoryFullName: string | null
} | null = null
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
    // Prefer readwrite so Agent mode can apply patches back to disk.
    handle = await anyWindow.showDirectoryPicker({ mode: "readwrite" }).catch(async () => {
      return anyWindow.showDirectoryPicker({ mode: "read" })
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null
    throw error
  }
  const allowed = await ensurePermission(handle)
  if (!allowed) throw new Error("Folder permission was denied")
  // Best-effort upgrade to write for agent applies (user may deny and stay read-only).
  try {
    if (handle.requestPermission) {
      await handle.requestPermission({ mode: "readwrite" })
    }
  } catch {
    // stay read-only
  }
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
  if (memoryState) return memoryState
  if (!virtualProject) return null
  return {
    projectId: virtualProject.projectId,
    displayName: virtualProject.displayName,
    rootName: virtualProject.rootName,
    entries: virtualProject.paths.map((path) => ({
      path,
      name: path.split("/").pop() || path,
      kind: classifyPath(path),
    })),
    truncated: false,
    indexedAt: Date.now(),
  }
}

export function getActiveLocalProjectId(): string | null {
  return memoryState?.projectId ?? virtualProject?.projectId ?? null
}

/** Seed searchable paths for a GitHub/DB project without a browser folder grant. */
export function setVirtualProjectIndex(input: {
  projectId: string
  displayName: string
  rootName: string
  paths: string[]
  repositoryFullName?: string | null
} | null) {
  virtualProject = input
    ? {
        projectId: input.projectId,
        displayName: input.displayName,
        rootName: input.rootName,
        paths: input.paths,
        repositoryFullName: input.repositoryFullName ?? null,
      }
    : null
}

export function clearLocalWorkspace() {
  memoryState = null
  memoryHandle = null
  virtualProject = null
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
  const state = getLocalWorkspace()
  if (!state) return []
  const q = query.trim().toLowerCase()
  const matched = q
    ? state.entries.filter((entry) =>
      entry.path.toLowerCase().includes(q)
      || entry.name.toLowerCase().includes(q),
    )
    : state.entries
  const labelRoot = state.displayName || state.rootName
  // GitHub-backed virtual projects still use local: ids for path search UX;
  // content is resolved via attachments or GitHub references on the server.
  return matched.slice(0, limit).map((entry) => localFileReference(entry, labelRoot, state.projectId))
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

type FileSystemWritable = {
  write: (data: string | BufferSource | Blob) => Promise<void>
  close: () => Promise<void>
}

type WritableFileHandle = FileSystemFileHandleLike & {
  createWritable?: () => Promise<FileSystemWritable>
}

/**
 * Write text into the granted local folder (requires readwrite permission).
 * Creates intermediate directories when the File System Access API allows it.
 */
export async function writeLocalWorkspaceFile(
  path: string,
  content: string,
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  try {
    if (!memoryHandle) {
      return { ok: false, error: "No local folder linked. Re-open the project folder with write access." }
    }
    const allowed = await ensureWritePermission(memoryHandle)
    if (!allowed) {
      return { ok: false, error: "Write permission denied. Re-open the folder and allow editing." }
    }

    const parts = path.replaceAll("\\", "/").split("/").filter(Boolean)
    if (parts.length === 0) return { ok: false, error: "Invalid path" }
    const fileName = parts[parts.length - 1]!
    let dir: FileSystemDirectoryHandleLike = memoryHandle

    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i]!
      if (!dir.getDirectoryHandle) {
        return { ok: false, error: "This browser cannot create nested folders." }
      }
      dir = await dir.getDirectoryHandle(part, { create: true })
    }

    if (!dir.getFileHandle) {
      return { ok: false, error: "This browser cannot write files in the folder." }
    }
    const handle = (await dir.getFileHandle(fileName, { create: true })) as WritableFileHandle
    if (!handle.createWritable) {
      return { ok: false, error: "Writable file streams are unavailable in this browser." }
    }
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
    pathHandleCache.set(path.replaceAll("\\", "/"), handle)

    // Keep the in-memory index aware of new paths.
    if (memoryState) {
      const normalized = path.replaceAll("\\", "/")
      if (!memoryState.entries.some((entry) => entry.path === normalized)) {
        memoryState = {
          ...memoryState,
          entries: [
            ...memoryState.entries,
            {
              path: normalized,
              name: fileName,
              kind: classifyPath(normalized),
            },
          ],
        }
      }
    }

    return { ok: true, path: path.replaceAll("\\", "/") }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Could not write local file",
    }
  }
}

async function ensureWritePermission(handle: FileSystemDirectoryHandleLike): Promise<boolean> {
  try {
    if (handle.queryPermission) {
      const current = await handle.queryPermission({ mode: "readwrite" })
      if (current === "granted") return true
    }
    if (handle.requestPermission) {
      const next = await handle.requestPermission({ mode: "readwrite" })
      return next === "granted"
    }
    return false
  } catch {
    return false
  }
}

export function hasLocalWorkspaceHandle(): boolean {
  return Boolean(memoryHandle)
}

export async function hasLocalWorkspaceWriteAccess(): Promise<boolean> {
  if (!memoryHandle) return false
  try {
    if (memoryHandle.queryPermission) {
      return (await memoryHandle.queryPermission({ mode: "readwrite" })) === "granted"
    }
    return false
  } catch {
    return false
  }
}

/**
 * Ensure we have a folder handle with readwrite permission.
 * Call only from a user gesture (button click). May open the directory picker.
 */
export async function ensureLocalWorkspaceWritable(): Promise<{
  ok: boolean
  prompted: boolean
  error?: string
}> {
  // Already writable
  if (memoryHandle) {
    const allowed = await ensureWritePermission(memoryHandle)
    if (allowed) return { ok: true, prompted: false }
  }

  // Try restoring a persisted handle for the active project (still needs a gesture for permission).
  if (!memoryHandle) {
    try {
      const restored = await restoreLocalWorkspace(memoryState?.projectId ?? getActiveLocalProjectId())
      if (restored && memoryHandle) {
        const allowed = await ensureWritePermission(memoryHandle)
        if (allowed) return { ok: true, prompted: true }
      }
    } catch {
      // fall through to picker
    }
  }

  // Last resort: pick the project folder with write access (user gesture).
  if (!supportsDirectoryPicker()) {
    return {
      ok: false,
      prompted: true,
      error: "This browser can’t write to folders. Use Chrome/Edge.",
    }
  }

  try {
    const anyWindow = window as unknown as {
      showDirectoryPicker: (options?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandleLike>
    }
    const handle = await anyWindow.showDirectoryPicker({ mode: "readwrite" })
    const writeOk = await ensureWritePermission(handle)
    if (!writeOk) {
      return {
        ok: false,
        prompted: true,
        error: "Write access was denied. Choose the project folder and allow editing.",
      }
    }
    await indexDirectoryHandle(handle, {
      projectId: memoryState?.projectId ?? getActiveLocalProjectId(),
      displayName: memoryState?.displayName,
      persistRemote: true,
    })
    return { ok: true, prompted: true }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, prompted: true, error: "Folder picker cancelled" }
    }
    return {
      ok: false,
      prompted: true,
      error: error instanceof Error ? error.message : "Could not open project folder",
    }
  }
}

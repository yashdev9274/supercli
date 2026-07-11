import chalk from "chalk"
import { theme } from "src/cli/utils/tui.ts"
import {
  searchFiles,
  findDragDropPaths,
  type FileEntry,
} from "src/lib/file-search.ts"

export type AtItemType = "file"

export type AtItem = {
  type: AtItemType
  name: string
  display: string
  path: string
}

/**
 * Manages the `@` file picker overlay.
 * Triggered by typing @ in the input. Shows fuzzy-matched files.
 */
export class AtPicker {
  visible = false
  query = ""
  items: AtItem[] = []
  selected = 0
  overlayLines = 0
  private workspaceRoot = ""

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root
  }

  getRelativePath(absolutePath: string): string {
    if (this.workspaceRoot && absolutePath.startsWith(this.workspaceRoot)) {
      return absolutePath.replace(this.workspaceRoot, "").replace(/^\//, "")
    }
    return absolutePath
  }

  refreshItems(): void {
    this.items = searchFiles(this.query).map((f: FileEntry) => ({
      type: "file" as AtItemType,
      name: f.name,
      display: f.relativePath || f.name,
      path: f.path,
    }))
    this.selected = 0
  }

  render(width: number): string[] {
    const lines: string[] = []
    if (this.items.length === 0) return lines

    const maxVisible = 10
    const total = this.items.length
    const half = Math.floor(maxVisible / 2)

    let start = Math.max(0, this.selected - half)
    const end = Math.min(total, start + maxVisible)
    if (end - start < maxVisible && start > 0) {
      start = Math.max(0, end - maxVisible)
    }

    const hasPrev = start > 0
    const hasNext = end < total

    if (hasPrev) {
      lines.push(
        ` ${chalk.hex(theme.greenDim)(`▲ ${start} more`)}`,
      )
    }

    for (let i = start; i < end; i++) {
      const item = this.items[i]
      const isSelected = i === this.selected
      const prefix = isSelected
        ? chalk.hex(theme.amber)("▸")
        : chalk.hex(theme.muted)(" ")
      const bg = isSelected ? chalk.bgHex(theme.greenDeep) : (s: string) => s

      if (!item) continue

      const relPath = this.getRelativePath(item.path)
      const dir = chalk.hex(theme.muted)(
        relPath.slice(0, Math.max(0, relPath.length - item.name.length)),
      )
      const file = chalk.hex(theme.white)(item.name)
      const label = `${chalk.hex(theme.green)("📄")} ${dir}${file}`
      const padded = label.padEnd(width - 8)
      lines.push(` ${bg(`${prefix} ${padded}`)}${chalk.reset("")}`)
    }

    if (hasNext) {
      lines.push(
        ` ${chalk.hex(theme.greenDim)(`▼ ${total - end} more`)}`,
      )
    }

    this.overlayLines = lines.length
    return lines
  }

  selectNext(): void {
    if (this.items.length === 0) return
    this.selected = (this.selected + 1) % this.items.length
  }

  selectPrev(): void {
    if (this.items.length === 0) return
    this.selected =
      (this.selected - 1 + this.items.length) % this.items.length
  }

  getSelected(): AtItem | null {
    if (this.items.length === 0) return null
    return this.items[this.selected] ?? null
  }

  open(query: string): void {
    this.visible = true
    this.query = query
    this.selected = 0
    this.refreshItems()
  }

  close(): void {
    this.visible = false
    this.query = ""
    this.items = []
    this.selected = 0
    this.overlayLines = 0
  }
}

/**
 * Tracks file paths inserted via drag-drop.
 * On each character insertion, checkDragDrop() scans the input
 * for paths that match real files in the workspace index.
 */
export class DragDropTracker {
  detectedFiles = new Set<string>()
  private workspaceRoot = ""

  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root
  }

  setRoot(root: string): void {
    this.workspaceRoot = root
  }

  checkDragDrop(input: string): string[] {
    if (!this.workspaceRoot) return []
    const found = findDragDropPaths(input, this.workspaceRoot)
    const newFiles: string[] = []
    for (const f of found) {
      if (!this.detectedFiles.has(f)) {
        this.detectedFiles.add(f)
        newFiles.push(f)
      }
    }
    return newFiles
  }

  render(width: number): string[] {
    if (this.detectedFiles.size === 0) return []

    const names: string[] = []
    for (const p of this.detectedFiles) {
      const rel =
        this.workspaceRoot && p.startsWith(this.workspaceRoot)
          ? p.replace(this.workspaceRoot, "").replace(/^\//, "")
          : p
      names.push(rel)
    }

    let label: string
    const first = names[0]!
    if (names.length === 1) {
      label = `📄 ${first} loaded`
    } else {
      label = `📄 ${first} +${names.length - 1} more`
    }

    return [
      ` ${chalk.hex(theme.greenMute)("┊")} ${chalk.hex(theme.green)(label)} ${chalk.hex(theme.greenMute)("┊")}`,
    ]
  }

  clear(): void {
    this.detectedFiles.clear()
  }
}

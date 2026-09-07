/**
 * Chalk banners / file-tree rendering for workspace info.
 */
import chalk from "chalk"
import { theme, frame } from "../utils/tui.ts"
import type { FileNode, WorkspaceInfo } from "./scanner.ts"

function metaLine(label: string, value: string): string {
  const pad = label.padEnd(8, " ")
  return `  ${chalk.hex(theme.greenDim)(pad)} ${chalk.hex(theme.greenDim)("·")} ${value}`
}

export function renderWorkspaceBanner(info: WorkspaceInfo): string {
  const lines: string[] = []
  const dot = chalk.hex(theme.green)("●")

  lines.push(
    `  ${chalk.hex(theme.green).bold("workspace")} ${chalk.hex(theme.greenDim)("·")} ${chalk.hex(theme.white)(info.dirName)}`,
  )
  lines.push(metaLine("path", chalk.hex(theme.greenGlow)(info.fullPath)))

  if (info.gitBranch) {
    lines.push(metaLine("git", `${chalk.hex(theme.amber)(info.gitBranch)} ${dot}`))
  }

  lines.push(metaLine("files", chalk.hex(theme.greenGlow)(String(info.fileCount))))

  if (info.techStack.length > 0) {
    const tech = info.techStack
      .slice(0, 5)
      .map((t) => chalk.hex(theme.greenGlow)(t))
      .join(` ${chalk.hex(theme.greenDim)("·")} `)
    lines.push(metaLine("stack", tech))
  }

  return frame(lines.join("\n"), {
    title: "directory",
    borderColor: theme.greenDim,
    padding: 0,
  })
}

export function renderFileTree(info: WorkspaceInfo): string {
  return renderTree(info.fileTree, "")
}

function renderTree(nodes: FileNode[], indent: string): string {
  let result = ""
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!
    const isLast = i === nodes.length - 1
    const prefix = isLast ? "└── " : "├── "
    const childIndent = isLast ? "    " : "│   "

    const label =
      node.type === "dir"
        ? chalk.hex(theme.greenGlow)(`${node.name}/`)
        : chalk.hex(theme.white)(node.name)

    result += `${indent}${chalk.hex(theme.greenDim)(prefix)}${label}\n`

    if (node.children && node.children.length > 0) {
      result += renderTree(node.children, indent + childIndent)
    }
  }
  return result
}

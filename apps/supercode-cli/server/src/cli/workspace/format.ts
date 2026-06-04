import chalk from "chalk"
import { theme } from "../utils/tui.ts"
import type { WorkspaceInfo } from "./scanner.ts"

export function renderWorkspaceBanner(info: WorkspaceInfo): string {
  const lines: string[] = []

  lines.push(` ${chalk.hex(theme.cyan).bold("Workspace:")} ${chalk.hex(theme.text)(info.dirName)}`)
  lines.push(` ${chalk.hex(theme.dim)("Path:")} ${chalk.hex(theme.muted)(info.fullPath)}`)

  if (info.gitBranch) {
    const dot = chalk.hex(theme.green)("\u25CF")
    lines.push(` ${chalk.hex(theme.dim)("Git:")} ${chalk.hex(theme.text)(info.gitBranch)} ${dot}`)
  }

  lines.push(` ${chalk.hex(theme.dim)("Files:")} ${chalk.hex(theme.text)(String(info.fileCount))}`)

  if (info.techStack.length > 0) {
    const tech = info.techStack.slice(0, 5).join(" \u00B7 ")
    lines.push(` ${chalk.hex(theme.dim)("Stack:")} ${chalk.hex(theme.muted)(tech)}`)
  }

  return lines.join("\n")
}

export function renderFileTree(info: WorkspaceInfo): string {
  return renderTree(info.fileTree, "")
}

function renderTree(
  nodes: Array<{ name: string; type: "file" | "dir"; children?: any[] }>,
  indent: string,
): string {
  let result = ""
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!
    const isLast = i === nodes.length - 1
    const prefix = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 "
    const childIndent = isLast ? "    " : "\u2502   "

    const label = node.type === "dir"
      ? chalk.hex(theme.cyan)(`${node.name}/`)
      : chalk.hex(theme.text)(node.name)

    result += `${indent}${chalk.hex(theme.dim)(prefix)}${label}\n`

    if (node.children && node.children.length > 0) {
      result += renderTree(node.children, indent + childIndent)
    }
  }
  return result
}

/** Core identity + env block for the coding agent system prompt. */
import type { WorkspaceInfo } from "../scanner.ts"

export function identitySection(info: WorkspaceInfo): string[] {
  const lines: string[] = []
  lines.push("You are supercode, an interactive CLI coding agent that helps users with software")
  lines.push("engineering tasks. Use the instructions below and the tools available to you to")
  lines.push("assist the user.")
  lines.push("")

  const env: string[] = ["<env>"]
  env.push(`  Working directory: ${process.cwd()}`)
  env.push(`  Workspace root folder: ${info.fullPath}`)
  if (info.isMonorepo) env.push("  Structure: Monorepo")
  if (info.gitBranch) env.push(`  Git branch: ${info.gitBranch}`)
  env.push(`  Platform: ${process.platform}`)
  env.push(`  Today's date: ${new Date().toDateString()}`)
  env.push("</env>")
  lines.push(env.join("\n"))
  lines.push("")
  return lines
}

export function workspaceSection(info: WorkspaceInfo): string[] {
  const lines: string[] = []
  lines.push(`## Workspace: ${info.projectName || info.dirName}`)
  lines.push(`- Path: ${info.fullPath}`)
  if (info.gitBranch) lines.push(`- Git branch: ${info.gitBranch}`)
  lines.push(`- Files: ${info.fileCount}`)
  lines.push("")

  if (info.techStack.length > 0) {
    lines.push("## Tech Stack")
    for (const tech of info.techStack) lines.push(`- ${tech}`)
    lines.push("")
  }

  if (info.fileTree.length > 0) {
    lines.push("## Project Structure")
    lines.push(formatTreeForPrompt(info.fileTree, "").trimEnd())
    lines.push("")
  }
  return lines
}

export function formatTreeForPrompt(
  nodes: Array<{ name: string; type: "file" | "dir"; children?: any[] }>,
  indent: string,
): string {
  let result = ""
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!
    const isLast = i === nodes.length - 1
    const prefix = isLast ? "└── " : "├── "
    const childIndent = isLast ? "    " : "│   "
    result += `${indent}${prefix}${node.name}${node.type === "dir" ? "/" : ""}\n`
    if (node.children?.length) {
      result += formatTreeForPrompt(node.children, indent + childIndent)
    }
  }
  return result
}

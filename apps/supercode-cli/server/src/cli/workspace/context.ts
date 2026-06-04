import type { WorkspaceInfo } from "./scanner.ts"

export function buildSystemPrompt(info: WorkspaceInfo): string {
  const lines: string[] = []

  lines.push("You are Supercode, an AI coding assistant running in the user's terminal.")
  lines.push("You have full awareness of the user's current workspace and project structure.")
  lines.push("")
  lines.push(`## Workspace: ${info.projectName || info.dirName}`)
  lines.push(`- Path: ${info.fullPath}`)
  if (info.gitBranch) {
    lines.push(`- Git branch: ${info.gitBranch}`)
  }
  lines.push(`- Files: ${info.fileCount}`)
  if (info.isMonorepo) {
    lines.push("- Structure: Monorepo")
  }
  lines.push("")

  if (info.techStack.length > 0) {
    lines.push("## Tech Stack")
    for (const tech of info.techStack) {
      lines.push(`- ${tech}`)
    }
    lines.push("")
  }

  if (info.fileTree.length > 0) {
    lines.push("## Project Structure")
    lines.push(formatTreeForPrompt(info.fileTree, "").trimEnd())
    lines.push("")
  }

  lines.push("## Available Tools")
  lines.push("")
  lines.push("You have access to the following tools to explore and modify the workspace:")
  lines.push("")
  lines.push("1. `read_file(path, maxLines?)` — Read the contents of any file in the workspace.")
  lines.push("   Use this to examine source code, configs, or any file the user asks about.")
  lines.push("")
  lines.push("2. `search_files(pattern, include?, maxResults?)` — Search for text patterns")
  lines.push("   across workspace files. Use this to find relevant code, function definitions,")
  lines.push("   imports, or any text in the codebase.")
  lines.push("")
  lines.push("## Guidelines")
  lines.push("")
  lines.push("- When the user asks about code, use read_file or search_files to investigate.")
  lines.push("- When suggesting changes, reference specific file paths and line numbers.")
  lines.push("- If you need more context, use the tools to explore the codebase.")
  lines.push("- The workspace root is the base for all relative file paths.")
  lines.push("- Answer questions about the codebase accurately based on what you find.")

  return lines.join("\n")
}

function formatTreeForPrompt(nodes: Array<{ name: string; type: "file" | "dir"; children?: any[] }>, indent: string): string {
  let result = ""
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!
    const isLast = i === nodes.length - 1
    const prefix = isLast ? "└── " : "├── "
    const childIndent = isLast ? "    " : "│   "

    result += `${indent}${prefix}${node.name}${node.type === "dir" ? "/" : ""}\n`

    if (node.children && node.children.length > 0) {
      result += formatTreeForPrompt(node.children, indent + childIndent)
    }
  }
  return result
}

export function shortWorkspaceSummary(info: WorkspaceInfo): string {
  const parts: string[] = []
  if (info.gitBranch) parts.push(`Git: ${info.gitBranch}`)
  if (info.techStack.length > 0) parts.push(info.techStack.slice(0, 4).join(" · "))
  parts.push(`${info.fileCount} files`)
  return parts.join("  ·  ")
}

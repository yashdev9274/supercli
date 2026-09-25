/** Installed agent skills section (from ~/.supercode). */
import fs from "fs"
import path from "path"
import os from "os"

export function skillsSection(): string[] {
  const skillsDir = path.join(os.homedir(), ".supercode", "skills")
  const lockPath = path.join(os.homedir(), ".supercode", "skills-lock.json")

  let lock: Record<string, { source?: string }> = {}
  try {
    lock = JSON.parse(fs.readFileSync(lockPath, "utf-8")).skills || {}
  } catch {
    return []
  }

  const entries = Object.entries(lock)
  if (entries.length === 0) return []

  const lines: string[] = [
    "## Available Skills",
    "",
    "You have the following agent skills installed. Use the `skill` tool to manage and load them:",
    '- `skill({ action: "load", name: "<skill-name>" })` — Read a skill\'s full instructions. Call this when a task matches a skill\'s description.',
    '- `skill({ action: "list" })` — List all installed skills.',
    '- `skill({ action: "install", name: "<name>", source: "<owner/repo>" })` — Install a new skill from GitHub.',
    '- `skill({ action: "remove", name: "<name>" })` — Uninstall a skill.',
    "",
  ]

  for (const [name, def] of entries) {
    const skillFile = path.join(skillsDir, name, "SKILL.md")
    let description = ""
    try {
      const content = fs.readFileSync(skillFile, "utf-8")
      const match = content.match(/description:\s*(.+)/)
      description = match ? match[1]!.trim() : ""
    } catch {
      description = "(not on disk — run `supercode skill sync`)"
    }
    lines.push(`- **${name}** — ${description || "(no description)"}`)
    if (def.source) lines.push(`  Source: ${def.source}`)
  }
  lines.push("")
  return lines
}

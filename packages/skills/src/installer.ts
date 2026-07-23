import fs from "fs/promises"
import path from "path"
import crypto from "crypto"
import type { SkillDefinition, InstalledSkill } from "./types"
import {
  getSkillsDir,
  getSkillDir,
  getSkillFilePath,
  readSkillsLock,
  addSkillToLock,
  removeSkillFromLock,
  listSkillEntries,
} from "./lock-file"

const GITHUB_RAW = "https://raw.githubusercontent.com"

function computeHash(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function buildGithubUrl(source: string, skillPath?: string, skillName?: string): string {
  const resolvedPath =
    skillPath || `skills/${skillName}/SKILL.md`
  return `${GITHUB_RAW}/${source}/main/${resolvedPath}`
}

function parseFrontmatter(content: string): { description: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return { description: "" }
  const frontmatter = match[1]!
  const descMatch = frontmatter.match(/description:\s*(.+)/)
  return { description: descMatch ? descMatch[1]!.trim() : "" }
}

export async function installSkill(
  name: string,
  source: string,
  skillPath?: string,
): Promise<void> {
  const url = buildGithubUrl(source, skillPath, name)

  const resp = await fetch(url)
  if (!resp.ok) {
    throw new Error(
      `Failed to download skill from ${url} (HTTP ${resp.status})`,
    )
  }

  const content = await resp.text()
  const hash = computeHash(content)
  const dir = getSkillDir(name)

  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(getSkillFilePath(name), content, "utf-8")

  const definition: SkillDefinition = {
    source,
    sourceType: "github",
    skillPath: skillPath || `skills/${name}/SKILL.md`,
    computedHash: hash,
  }

  await addSkillToLock(name, definition)
}

export async function uninstallSkill(name: string): Promise<void> {
  const dir = getSkillDir(name)
  await fs.rm(dir, { recursive: true, force: true })
  await removeSkillFromLock(name)
}

export async function listInstalledSkills(): Promise<InstalledSkill[]> {
  const entries = await listSkillEntries()
  const results: InstalledSkill[] = []

  for (const [name, definition] of entries) {
    const filePath = getSkillFilePath(name)
    let description = ""
    try {
      const content = await fs.readFile(filePath, "utf-8")
      description = parseFrontmatter(content).description
    } catch {
      description = "(not on disk)"
    }
    results.push({ name, definition, description, localPath: filePath })
  }

  return results
}

export async function syncSkills(): Promise<{ restored: string[]; failed: string[] }> {
  const entries = await listSkillEntries()
  const restored: string[] = []
  const failed: string[] = []

  for (const [name, definition] of entries) {
    const filePath = getSkillFilePath(name)
    try {
      await fs.access(filePath)
      continue
    } catch {
      try {
        const url = buildGithubUrl(
          definition.source,
          definition.skillPath,
          name,
        )
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        const content = await resp.text()
        await fs.mkdir(getSkillDir(name), { recursive: true })
        await fs.writeFile(filePath, content, "utf-8")
        restored.push(name)
      } catch {
        failed.push(name)
      }
    }
  }

  return { restored, failed }
}

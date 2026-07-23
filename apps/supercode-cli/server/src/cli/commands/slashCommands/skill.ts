import chalk from "chalk"
import fs from "fs"
import path from "path"
import readline from "readline"
import { listInstalledSkills, installSkill, uninstallSkill } from "@super/skills"
import { theme, frame, sectionHeader, heavyDivider } from "src/cli/utils/tui.ts"

type Action = "list" | "info" | "add" | "remove" | "load"

interface SkillEntry {
  name: string
  description: string
  localPath: string
  source: string
}

function findRepoRoot(): string {
  return process.env.SUPERCODE_WORKSPACE_ROOT || process.cwd()
}

function getSkillsDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || ""
  return path.join(home, ".supercode", "skills")
}

function readDescription(skillPath: string): string {
  try {
    const content = fs.readFileSync(skillPath, "utf-8")
    const lines = content.split("\n")
    if (lines[0]?.trim() === "---") {
      const end = lines.indexOf("---", 1)
      if (end > 1) {
        const fm = lines.slice(1, end).join("\n")
        const descMatch = fm.match(/^description\s*:\s*(.+)$/m)
        if (descMatch) return descMatch[1]!.trim()
      }
    }
    return ""
  } catch {
    return ""
  }
}

/**
 * Enumerate ALL skills available in the supercode ecosystem:
 *  1. Installed skills (from ~/.supercode/skills/)
 *  2. Skills in the repo's .agents/skills/ directory
 *  3. Skills in the repo's skills/ directory
 */
function listAllSkills(): SkillEntry[] {
  const seen = new Set<string>()
  const entries: SkillEntry[] = []
  const root = findRepoRoot()
  const skillsDir = getSkillsDir()

  // 1. Installed skills
  try {
    const lockPath = path.join(skillsDir, "..", "skills-lock.json")
    if (fs.existsSync(lockPath)) {
      const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"))
      for (const [name, def] of Object.entries<Record<string, any>>(lock.skills || {})) {
        const localPath = path.join(skillsDir, name, "SKILL.md")
        if (fs.existsSync(localPath)) {
          seen.add(name)
          entries.push({
            name,
            description: readDescription(localPath),
            localPath,
            source: def.source || "installed",
          })
        }
      }
    }
  } catch {}

  // 2. Repo .agents/skills/ (at root and any sub-package)
  const searchDirs = [root]
  // Also scan sub-package .agents dirs
  try {
    const pkgs = path.join(root, "packages")
    if (fs.existsSync(pkgs)) {
      for (const pkg of fs.readdirSync(pkgs)) {
        const agentsDir = path.join(pkgs, pkg, ".agents")
        if (fs.existsSync(agentsDir)) searchDirs.push(agentsDir)
      }
    }
  } catch {}

  for (const dir of searchDirs) {
    const agentsSkills = path.join(dir, "skills")
    if (fs.existsSync(agentsSkills)) {
      for (const name of fs.readdirSync(agentsSkills)) {
        if (seen.has(name)) continue
        const skillPath = path.join(agentsSkills, name, "SKILL.md")
        if (fs.existsSync(skillPath)) {
          seen.add(name)
          entries.push({
            name,
            description: readDescription(skillPath),
            localPath: skillPath,
            source: "supercode",
          })
        }
      }
    }
  }

  // 3. Root skills/ directory
  const rootSkills = path.join(root, "skills")
  if (fs.existsSync(rootSkills)) {
    for (const name of fs.readdirSync(rootSkills)) {
      if (seen.has(name)) continue
      const skillPath = path.join(rootSkills, name, "SKILL.md")
      if (fs.existsSync(skillPath)) {
        seen.add(name)
        entries.push({
          name,
          description: readDescription(skillPath),
          localPath: skillPath,
          source: "supercode",
        })
      }
    }
  }

  // Sort: installed first, then alphabetically
  entries.sort((a, b) => {
    const aInst = a.source !== "supercode" ? 0 : 1
    const bInst = b.source !== "supercode" ? 0 : 1
    if (aInst !== bInst) return aInst - bInst
    return a.name.localeCompare(b.name)
  })

  return entries
}

type KeyPress =
  | "up" | "down" | "enter" | "escape" | "backspace" | "ctrl_c" | "ctrl_u" | "ctrl_v"
  | { char: string }

function readRawKey(): Promise<KeyPress> {
  return new Promise((resolve) => {
    let buf = Buffer.alloc(0)

    const handler = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      const b = Array.from(buf)

      if (b.length === 1) {
        if (b[0] === 0x0d || b[0] === 0x0a) { cleanup(); resolve("enter"); return }
        if (b[0] === 0x1b) return
        if (b[0] === 0x03) { cleanup(); resolve("ctrl_c"); return }
        if (b[0] === 0x15) { cleanup(); resolve("ctrl_u"); return }
        if (b[0] === 0x16) { cleanup(); resolve("ctrl_v"); return }
        if (b[0] === 0x7f || b[0] === 0x08) { cleanup(); resolve("backspace"); return }
        if (b[0]! >= 0x20 && b[0]! <= 0x7e) { cleanup(); resolve({ char: String.fromCodePoint(b[0]!) }); return }
      }

      if (b.length >= 2 && b[0] === 0x1b) {
        if (b[1] === 0x5b && b.length >= 3) {
          if (b[2] === 0x41) { cleanup(); resolve("up"); return }
          if (b[2] === 0x42) { cleanup(); resolve("down"); return }
          cleanup(); resolve("escape"); return
        }
        cleanup(); resolve("escape"); return
      }

      cleanup()
      process.stdin.once("data", handler)
    }

    const timeout = setTimeout(() => {
      if (buf.length === 1 && buf[0] === 0x1b) {
        cleanup(); resolve("escape")
      } else {
        process.stdin.once("data", handler)
      }
    }, 80)

    const cleanup = () => {
      clearTimeout(timeout)
      process.stdin.removeListener("data", handler)
    }

    process.stdin.once("data", handler)
  })
}

class SkillPicker {
  items: SkillEntry[] = []
  filterQuery = ""

  private _filtered: number[] = []
  filteredIndex = 0
  overlayLines = 0

  constructor(items: SkillEntry[]) {
    this.items = items
    this.computeFiltered()
  }

  private computeFiltered(): void {
    const q = this.filterQuery.toLowerCase().trim()
    this._filtered = this.items.reduce<number[]>((acc, item, idx) => {
      if (!q || item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q)) {
        acc.push(idx)
      }
      return acc
    }, [])
    this.filteredIndex = 0
  }

  setFilter(q: string): void {
    this.filterQuery = q
    this.computeFiltered()
  }

  get filteredCount(): number {
    return this._filtered.length
  }

  getSelected(): SkillEntry | undefined {
    if (this._filtered.length === 0) return undefined
    return this.items[this._filtered[this.filteredIndex]!]!
  }

  selectNext(): void {
    if (this._filtered.length === 0) return
    this.filteredIndex = (this.filteredIndex + 1) % this._filtered.length
  }

  selectPrev(): void {
    if (this._filtered.length === 0) return
    this.filteredIndex = (this.filteredIndex - 1 + this._filtered.length) % this._filtered.length
  }

  render(width: number): string[] {
    const lines: string[] = []
    const allIndices = this._filtered

    const thinDiv = (): string =>
      chalk.hex(theme.greenDim)("─".repeat(Math.min(width, 80)))

    if (allIndices.length === 0) {
      lines.push(thinDiv())
      lines.push(` ${chalk.hex(theme.greenGlow)("Skills")} ${chalk.hex(theme.muted)("· no matching skills")}`)
      lines.push(thinDiv())
      this.overlayLines = lines.length
      return lines
    }

    const maxVisible = 8
    const half = Math.floor(maxVisible / 2)

    let startIdx = Math.max(0, this.filteredIndex - half)
    let endIdx = Math.min(allIndices.length, startIdx + maxVisible)
    if (endIdx - startIdx < maxVisible && startIdx > 0) {
      startIdx = Math.max(0, endIdx - maxVisible)
    }

    const visibleSlice = allIndices.slice(startIdx, endIdx)
    const hasPrev = startIdx > 0
    const hasNext = endIdx < allIndices.length

    lines.push(thinDiv())
    lines.push(
      ` ${chalk.hex(theme.greenGlow)("Skills")} ${chalk.hex(theme.muted)(`· ${allIndices.length} available`)}`,
    )

    if (this.filterQuery) {
      lines.push(` ${chalk.hex(theme.greenDim)("Search:")} ${chalk.hex(theme.white)(this.filterQuery)}${chalk.hex(theme.amber)("│")}`)
    } else {
      lines.push(` ${chalk.hex(theme.greenDim)("Search:")} ${chalk.hex(theme.muted)("type to filter · ↑↓ navigate · enter select · esc cancel")}`)
    }

    lines.push(thinDiv())

    if (hasPrev) {
      lines.push(` ${chalk.hex(theme.greenDim)(`▲ ${startIdx} more`)}`)
    }

    const maxDesc = Math.max(10, width - 40)
    for (const idx of visibleSlice) {
      const skill = this.items[idx]!
      const isSelected = idx === this._filtered[this.filteredIndex]

      const prefix = isSelected ? chalk.hex(theme.amber)("▸") : " "
      const name = chalk.hex(isSelected ? theme.white : theme.greenGlow)(
        skill.name.slice(0, 22).padEnd(24),
      )
      const desc = chalk.hex(theme.muted)(
        (skill.description || "(no description)").slice(0, maxDesc),
      )

      const tagColor = skill.source !== "supercode" ? theme.green : theme.greenDim
      const tag = chalk.hex(tagColor)(skill.source !== "supercode" ? skill.source : "local")

      const label = `${prefix} ${name}${tag.startsWith(" ") ? tag : " " + tag} ${desc}`
      const display = label.length > width ? label.slice(0, width) : label

      if (isSelected) {
        const bg = chalk.bgHex(theme.greenDeep)
        lines.push(bg(display))
      } else {
        lines.push(display)
      }
    }

    if (hasNext) {
      lines.push(` ${chalk.hex(theme.greenDim)(`▼ ${allIndices.length - endIdx} more`)}`)
    }

    lines.push(thinDiv())
    this.overlayLines = lines.length
    return lines
  }
}

async function pickSkillInteractive(): Promise<SkillEntry | undefined> {
  const allSkills = listAllSkills()
  if (allSkills.length === 0) return undefined

  const picker = new SkillPicker(allSkills)
  const cols = process.stdout.columns ?? 80

  const draw = () => {
    const lines = picker.render(cols)
    for (const line of lines) {
      process.stdout.write(line + "\n")
    }
  }

  const clear = (n: number) => {
    for (let i = 0; i < n; i++) {
      readline.moveCursor(process.stdout, 0, -1)
      readline.cursorTo(process.stdout, 0)
      readline.clearLine(process.stdout, 0)
    }
  }

  process.stdout.write("\n")
  draw()

  const wasRaw = process.stdin.isRaw
  if (process.stdin.isTTY) process.stdin.setRawMode(true)

  let selected: SkillEntry | undefined = undefined

  while (true) {
    const key = await readRawKey()
    if (key === "up") {
      picker.selectPrev()
      clear(picker.overlayLines)
      draw()
    } else if (key === "down") {
      picker.selectNext()
      clear(picker.overlayLines)
      draw()
    } else if (key === "enter") {
      selected = picker.getSelected()
      break
    } else if (key === "escape") {
      break
    } else if (key === "backspace") {
      picker.setFilter(picker.filterQuery.slice(0, -1))
      clear(picker.overlayLines)
      draw()
    } else if (key === "ctrl_u") {
      picker.setFilter("")
      clear(picker.overlayLines)
      draw()
    } else if (key === "ctrl_c") {
      process.stdout.write("^C\n")
      if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false)
      process.exit(1)
    } else if (typeof key === "object" && "char" in key) {
      picker.setFilter(picker.filterQuery + key.char)
      clear(picker.overlayLines)
      draw()
    }
  }

  if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw ?? false)
  clear(picker.overlayLines + 1)

  return selected
}

function loadSkillContent(skill: SkillEntry): string {
  try {
    const content = fs.readFileSync(skill.localPath, "utf-8")
    const body = content.split("\n").filter((l) => !l.startsWith("---")).join("\n").trim()
    return body
  } catch {
    return ""
  }
}

export async function skillCommand(argsStr: string): Promise<{ message?: string; skillName?: string } | void> {
  const parts = argsStr.trim().split(/\s+/).filter(Boolean)
  const [action = "", ...rest] = parts as [Action?, ...string[]]

  // If no subcommand or just "list", show interactive picker
  if (!action || action === "list") {
    const selected = await pickSkillInteractive()
    if (!selected) return

    const content = loadSkillContent(selected)
    return { message: content, skillName: selected.name }
  }

  const w = Math.min(process.stdout.columns ?? 80, 72)

  switch (action) {
    case "load": {
      const [loadName] = rest
      if (!loadName) {
        console.log(`  ${chalk.hex(theme.amber)("Usage:")} /<skill-name>  (e.g. /emil-design-eng)`)
        return
      }

      const all = listAllSkills()
      const skill = all.find((s) => s.name === loadName)
      if (!skill) {
        console.log(`  ${chalk.hex(theme.red)("✗")} ${chalk.hex(theme.white)("Skill")} ${chalk.hex(theme.red).bold(loadName)} ${chalk.hex(theme.white)("not found.")}`)
        return
      }

      const content = loadSkillContent(skill)
      return { message: content, skillName: skill.name }
    }

    case "add": {
      const [name, source, ...extra] = rest
      if (!name || !source) {
        console.log(`  ${chalk.hex(theme.amber)("Usage:")} /skills add <name> <owner/repo> [path]`)
        console.log(`  ${chalk.hex(theme.muted)("Example:")} /skills add emil-design-eng emilkowalski/skills`)
        return
      }
      const skillPath = extra.length > 0 ? extra[0] : undefined
      console.log(`  ${chalk.hex(theme.green)("◆")} ${chalk.hex(theme.white)("Installing skill")} ${chalk.bold(name)} ${chalk.hex(theme.dim)(`from ${source}...`)}`)
      try {
        await installSkill(name, source, skillPath)
        console.log(`  ${chalk.hex(theme.green)("✓")} ${chalk.hex(theme.white)("Skill")} ${chalk.bold(name)} ${chalk.hex(theme.green)("installed.")}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`  ${chalk.hex(theme.red)("✗")} ${chalk.hex(theme.white)("Failed:")} ${msg}`)
      }
      return
    }

    case "remove": {
      const [name] = rest
      if (!name) {
        console.log(`  ${chalk.hex(theme.amber)("Usage:")} /skills remove <name>`)
        return
      }
      try {
        await uninstallSkill(name)
        console.log(`  ${chalk.hex(theme.green)("✓")} ${chalk.hex(theme.white)("Skill")} ${chalk.bold(name)} ${chalk.hex(theme.green)("removed.")}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`  ${chalk.hex(theme.red)("✗")} ${chalk.hex(theme.white)("Failed:")} ${msg}`)
      }
      return
    }

    case "info": {
      const [name] = rest
      if (!name) {
        console.log(`  ${chalk.hex(theme.amber)("Usage:")} /skills info <name>`)
        return
      }

      const skills = await listInstalledSkills()
      const skill = skills.find((s) => s.name === name)

      if (!skill) {
        // Check local repo skills too
        const all = listAllSkills()
        const local = all.find((s) => s.name === name)
        if (!local) {
          console.log(`  ${chalk.hex(theme.red)("✗")} ${chalk.hex(theme.white)("Skill")} ${chalk.hex(theme.red).bold(name)} ${chalk.hex(theme.white)("not found.")}`)
          return
        }
        console.log()
        console.log(heavyDivider())
        console.log()
        console.log(sectionHeader(`Skill: ${local.name}`, { accent: "green" }))
        console.log()
        console.log(`  ${chalk.hex(theme.green)("name:")}        ${chalk.hex(theme.white).bold(local.name)}`)
        console.log(`  ${chalk.hex(theme.green)("description:")} ${chalk.hex(theme.muted)(local.description || "(none)")}`)
        console.log(`  ${chalk.hex(theme.green)("source:")}      ${chalk.hex(theme.dim)(local.source)}`)
        console.log(`  ${chalk.hex(theme.green)("path:")}        ${chalk.hex(theme.dim)(local.localPath)}`)
        console.log()
        const content = fs.readFileSync(local.localPath, "utf-8")
        const body = content.split("\n").filter((l) => !l.startsWith("---")).join("\n").trim()
        const output = frame(body, {
          title: ` ${local.localPath} `,
          borderColor: theme.greenDim,
          padding: 1,
        })
        console.log(output)
        console.log()
        console.log(heavyDivider())
        console.log()
        return
      }

      console.log()
      console.log(heavyDivider())
      console.log()
      console.log(sectionHeader(`Skill: ${skill.name}`, { accent: "green" }))
      console.log()
      console.log(`  ${chalk.hex(theme.green)("name:")}        ${chalk.hex(theme.white).bold(skill.name)}`)
      console.log(`  ${chalk.hex(theme.green)("description:")} ${chalk.hex(theme.muted)(skill.description || "(none)")}`)
      console.log(`  ${chalk.hex(theme.green)("source:")}      ${chalk.hex(theme.dim)(skill.definition.source)}`)
      console.log(`  ${chalk.hex(theme.green)("path:")}        ${chalk.hex(theme.dim)(skill.definition.skillPath)}`)
      console.log(`  ${chalk.hex(theme.green)("hash:")}        ${chalk.hex(theme.dim)(skill.definition.computedHash?.slice(0, 16) || "(unknown)")}`)
      console.log()
      console.log(chalk.hex(theme.green).bold("  SKILL.md"))
      console.log()

      try {
        const content = fs.readFileSync(skill.localPath, "utf-8")
        const body = content.split("\n").filter((l) => !l.startsWith("---")).join("\n").trim()
        const output = frame(body, {
          title: ` ~/.supercode/skills/${skill.name}/SKILL.md `,
          borderColor: theme.greenDim,
          padding: 1,
        })
        console.log(output)
        console.log()
      } catch {
        console.log(`  ${chalk.hex(theme.muted)("File not found on disk.")}`)
        console.log(`  ${chalk.hex(theme.muted)("Run")} ${chalk.hex(theme.green)("supercode skill sync")} ${chalk.hex(theme.muted)("to restore.")}`)
      }

      console.log(heavyDivider())
      console.log()
      return
    }

    default: {
      console.log(`  ${chalk.hex(theme.amber)("Usage:")} /skills [list|info <name>|add <name> <owner/repo>|remove <name>]`)
    }
  }
}

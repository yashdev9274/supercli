import { z } from "zod"
import fs from "fs/promises"
import path from "path"
import os from "os"
import { installSkill, uninstallSkill, listInstalledSkills } from "@super/skills"
import { serialize, ok, fail } from "../../cli/ai/tool-result"

const SKILLS_DIR = path.join(os.homedir(), ".supercode", "skills")

const skillSchema = z.object({
  action: z.enum(["install", "remove", "list", "info", "load"]).describe("What to do with the skill"),
  name: z.string().optional().describe("Skill name (required for install, remove, info, load)"),
  source: z.string().optional().describe("GitHub source as owner/repo (required for install)"),
  path: z.string().optional().describe("Custom path to SKILL.md within the repo (optional for install)"),
})

export type SkillArgs = z.infer<typeof skillSchema>

export const skillTool = {
  description: "Manage installed agent skills. Install new skills from GitHub, list installed skills, view details, or load a skill's full instructions. Install: call with action=\"install\", name=\"<skill>\", source=\"<owner/repo>\". List: call with action=\"list\". Load: call with action=\"load\", name=\"<skill>\" to read the full SKILL.md content.",
  parameters: skillSchema,
  execute: async (args: SkillArgs) =>
    serialize(async () => {
      const { action, name, source, path: skillPath } = args

      switch (action) {
        case "install": {
          if (!name || !source) {
            return fail("Missing required arguments: name and source are required for install. Example: install a skill named 'frontend-design' from 'anthropics/skills'.")
          }
          await installSkill(name, source, skillPath)
          return ok({ installed: name, source })
        }

        case "remove": {
          if (!name) {
            return fail("Missing required argument: name is required for remove.")
          }
          await uninstallSkill(name)
          return ok({ removed: name })
        }

        case "list": {
          const skills = await listInstalledSkills()
          const list = skills.map((s) => ({
            name: s.name,
            description: s.description,
            source: s.definition.source,
          }))
          return ok({ skills: list, count: list.length })
        }

        case "info": {
          if (!name) {
            return fail("Missing required argument: name is required for info.")
          }
          const skills = await listInstalledSkills()
          const skill = skills.find((s) => s.name === name)
          if (!skill) {
            return fail(`Skill "${name}" not found. Use action="list" to see installed skills.`)
          }
          return ok({
            name: skill.name,
            description: skill.description,
            source: skill.definition.source,
            path: skill.definition.skillPath,
          })
        }

        case "load": {
          if (!name) {
            return fail("Missing required argument: name is required for load.")
          }
          const filePath = path.join(SKILLS_DIR, name, "SKILL.md")
          let content: string
          try {
            content = await fs.readFile(filePath, "utf-8")
          } catch {
            return fail(`Skill "${name}" not found on disk. Use action="install" to install it first, then retry.`)
          }
          return ok({ name, content })
        }
      }
    }),
}

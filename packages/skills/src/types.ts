export interface SkillDefinition {
  source: string
  sourceType: "github" | "file" | "url"
  skillPath?: string
  computedHash?: string
}

export interface SkillsLock {
  version: number
  skills: Record<string, SkillDefinition>
}

export interface InstalledSkill {
  name: string
  definition: SkillDefinition
  description: string
  localPath: string
}

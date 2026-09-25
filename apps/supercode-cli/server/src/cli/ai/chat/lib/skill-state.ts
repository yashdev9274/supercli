/**
 * Loaded skill context injected into the system prompt for the next turn(s).
 */
export let loadedSkillName: string | undefined
let loadedSkillContent: string | undefined
let skillJustLoaded = false

export function getLoadedSkillContent(): string | undefined {
  return loadedSkillContent
}

export function isSkillJustLoaded(): boolean {
  return skillJustLoaded
}

export function consumeSkillJustLoaded(): boolean {
  const v = skillJustLoaded
  skillJustLoaded = false
  return v
}

export function setLoadedSkill(name: string, content: string): void {
  loadedSkillName = name
  loadedSkillContent = content
  skillJustLoaded = true
}

export function clearSkill(): void {
  loadedSkillName = undefined
  loadedSkillContent = undefined
  skillJustLoaded = false
}

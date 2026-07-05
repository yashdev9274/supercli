import type { DesignSkill } from "../types"
import { LANDING_PAGE_SKILL } from "./landing-page"
import { DASHBOARD_SKILL } from "./dashboard"
import { DECK_SKILL } from "./deck"
import { EMAIL_SKILL } from "./email"
import { SOCIAL_CREATIVE_SKILL } from "./social-creative"

const SKILLS: DesignSkill[] = [
  LANDING_PAGE_SKILL,
  DASHBOARD_SKILL,
  DECK_SKILL,
  EMAIL_SKILL,
  SOCIAL_CREATIVE_SKILL,
]

const SKILL_MAP = new Map(SKILLS.map((s) => [s.id, s]))

export function loadSkill(id: string): DesignSkill | undefined {
  return SKILL_MAP.get(id)
}

export function listSkills(): DesignSkill[] {
  return SKILLS
}

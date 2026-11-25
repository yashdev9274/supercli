export const SPECIALIST_ROLES = ["explorer", "implementer", "verifier"] as const
export type SpecialistRole = typeof SPECIALIST_ROLES[number]
export const SPECIALIST_READ_TOOLS = ["read_file", "search_files", "read_instructions"] as const

export function isSpecialistRole(value: unknown): value is SpecialistRole {
  return typeof value === "string" && (SPECIALIST_ROLES as readonly string[]).includes(value)
}

export function specialistCanUseTool(role: unknown, name: string): boolean {
  return isSpecialistRole(role) && (SPECIALIST_READ_TOOLS as readonly string[]).includes(name)
}

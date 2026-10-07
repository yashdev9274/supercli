export const SETTINGS_SECTIONS = ["general", "profile", "activity", "usage"] as const

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]

export function normalizeSettingsSection(value?: string | null): SettingsSectionId {
  if (value && (SETTINGS_SECTIONS as readonly string[]).includes(value)) {
    return value as SettingsSectionId
  }
  return "general"
}

import { z } from "zod"

import type { AgentSessionSummary } from "./types"

export const sidebarPreferencesSchema = z.object({
  version: z.literal(1).default(1),
  sort: z.enum(["updatedAt", "createdAt"]).default("updatedAt"),
  group: z.enum(["none", "project"]).default("project"),
  detailed: z.boolean().default(true),
  captionOrder: z.enum(["manual", "activity"]).default("manual"),
  filters: z.object({
    project: z.string().default("all"),
    participant: z.string().default("all"),
    creator: z.string().default("all"),
    origin: z.enum(["all", "web", "desktop", "slack", "linear", "github", "automation"]).default("all"),
  }).default({ project: "all", participant: "all", creator: "all", origin: "all" }),
  folders: z.array(z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(80) })).max(100).default([]),
  assignments: z.record(z.string(), z.string()).default({}),
  threadOrder: z.array(z.string()).default([]),
  groupOrder: z.array(z.string()).default([]),
  collapsed: z.array(z.string()).default([]),
  read: z.record(z.string(), z.number().int().nonnegative()).default({}),
})

export type SidebarPreferences = z.infer<typeof sidebarPreferencesSchema>
export type SidebarGroup = { id: string; name: string; folder: boolean; sessions: AgentSessionSummary[] }

export function parseSidebarPreferences(raw: string | null): SidebarPreferences {
  try {
    const parsed = sidebarPreferencesSchema.safeParse(raw ? JSON.parse(raw) : {})
    if (parsed.success) return parsed.data
  } catch { /* Ignore corrupt or outdated browser preferences. */ }
  return sidebarPreferencesSchema.parse({})
}

export function hasSidebarFilters(preferences: SidebarPreferences): boolean {
  return Object.values(preferences.filters).some((value) => value !== "all")
}

export function isThreadUnread(session: AgentSessionSummary, preferences: SidebarPreferences): boolean {
  return session.latestSequence > (preferences.read[session.id] ?? 0)
}

export function markThreadsRead(preferences: SidebarPreferences, sessions: AgentSessionSummary[]): SidebarPreferences {
  const read = { ...preferences.read }
  for (const session of sessions) read[session.id] = Math.max(read[session.id] ?? 0, session.latestSequence)
  return { ...preferences, read }
}

export function removeSidebarFolder(preferences: SidebarPreferences, folderId: string): SidebarPreferences {
  return {
    ...preferences,
    folders: preferences.folders.filter((folder) => folder.id !== folderId),
    assignments: Object.fromEntries(Object.entries(preferences.assignments).filter(([, id]) => id !== folderId)),
    groupOrder: preferences.groupOrder.filter((id) => id !== `folder:${folderId}`),
    collapsed: preferences.collapsed.filter((id) => id !== `folder:${folderId}`),
  }
}

export function reorderIds(ids: string[], source: string, target: string): string[] {
  if (source === target || !ids.includes(source) || !ids.includes(target)) return ids
  const next = ids.filter((id) => id !== source)
  next.splice(ids.indexOf(target), 0, source)
  return next
}

export function organizeSidebar(sessions: AgentSessionSummary[], query: string, preferences: SidebarPreferences): SidebarGroup[] {
  const { filters } = preferences
  const search = query.trim().toLowerCase()
  const filtered = sessions.filter((session) => {
    return (!search || session.objective.toLowerCase().includes(search))
      && (filters.project === "all" || (session.project?.id ?? "none") === filters.project)
      && (filters.creator === "all" || session.creator?.id === filters.creator)
      && (filters.participant === "all" || session.participants?.some((member) => member.id === filters.participant) || session.creator?.id === filters.participant)
      && (filters.origin === "all" || (session.origin ?? session.surfaces[0]?.provider) === filters.origin)
  })
  const ranks = new Map(preferences.threadOrder.map((id, index) => [id, index]))
  filtered.sort((a, b) => {
    const rankA = ranks.get(a.id)
    const rankB = ranks.get(b.id)
    if (rankA !== undefined || rankB !== undefined) return (rankA ?? Infinity) - (rankB ?? Infinity)
    return Date.parse(b[preferences.sort] ?? b.updatedAt) - Date.parse(a[preferences.sort] ?? a.updatedAt) || a.id.localeCompare(b.id)
  })
  const groups = new Map<string, SidebarGroup>()
  for (const folder of preferences.folders) {
    groups.set(`folder:${folder.id}`, { id: `folder:${folder.id}`, name: folder.name, folder: true, sessions: [] })
  }
  for (const session of filtered) {
    const folderId = preferences.assignments[session.id]
    const folder = folderId ? groups.get(`folder:${folderId}`) : undefined
    const id = folder?.id ?? (preferences.group === "project" ? `project:${session.project?.id ?? "none"}` : "all")
    const group = groups.get(id) ?? { id, name: preferences.group === "project" ? session.project?.name ?? "Home" : "All threads", folder: false, sessions: [] }
    group.sessions.push(session)
    groups.set(id, group)
  }
  const groupRanks = new Map(preferences.groupOrder.map((id, index) => [id, index]))
  const activity = (group: SidebarGroup) => Math.max(0, ...group.sessions.map((session) => Date.parse(session.updatedAt)))
  return [...groups.values()].filter((group) => group.sessions.length > 0 || (!search && !hasSidebarFilters(preferences) && group.folder)).sort((a, b) => {
    if (preferences.captionOrder === "activity") return activity(b) - activity(a) || a.name.localeCompare(b.name)
    return (groupRanks.get(a.id) ?? Infinity) - (groupRanks.get(b.id) ?? Infinity) || Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name)
  })
}

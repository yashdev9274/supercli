export type SideThreadTab = {
  key: string
  sessionId: string | null
  title: string
  closed: boolean
}

export function mergeSideThreadTabs(tabs: SideThreadTab[], sessions: Array<{ id: string; objective: string }>): SideThreadTab[] {
  const known = new Set(tabs.flatMap((tab) => tab.sessionId ? [tab.sessionId] : []))
  const titles = new Map(sessions.map((session) => [session.id, session.objective]))
  return [
    ...tabs.map((tab) => ({ ...tab, title: tab.sessionId ? titles.get(tab.sessionId) ?? tab.title : tab.title })),
    ...sessions.filter((session) => !known.has(session.id)).map((session) => ({ key: session.id, sessionId: session.id, title: session.objective, closed: false })),
  ]
}

export function saveSideThreadTab(tabs: SideThreadTab[], key: string, session: { id: string; objective: string }): SideThreadTab[] {
  // The draft controller must not remount (or lose its pending first turn).
  return tabs.filter((tab) => tab.key === key || tab.sessionId !== session.id)
    .map((tab) => tab.key === key ? { ...tab, sessionId: session.id, title: session.objective } : tab)
}

export function closeSideThreadTab(tabs: SideThreadTab[], key: string): SideThreadTab[] {
  // Keep even closed controllers mounted: a stream or unsent draft may still exist.
  return tabs.map((tab) => tab.key === key ? { ...tab, closed: true } : tab)
}

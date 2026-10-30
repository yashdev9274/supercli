"use client"

import { useCallback, useMemo, useSyncExternalStore } from "react"

import { parseSidebarPreferences, type SidebarPreferences } from "./sidebar-state"

const EVENT = "nova-sidebar-preferences"
const memory = new Map<string, string>()

function read(key: string): string | null {
  if (memory.has(key)) return memory.get(key) ?? null
  try { return localStorage.getItem(key) }
  catch { return null }
}

export function useSidebarPreferences(userId: string) {
  const key = `nova:thread-sidebar:v1:${userId}`
  const subscribe = useCallback((notify: () => void) => {
    function onStorage(event: StorageEvent) {
      if (event.key === key || event.key === null) {
        memory.delete(key)
        notify()
      }
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener(EVENT, notify)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(EVENT, notify)
    }
  }, [key])
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null)
  const preferences = useMemo(() => parseSidebarPreferences(raw), [raw])
  const update = useCallback((change: (current: SidebarPreferences) => SidebarPreferences) => {
    const next = JSON.stringify(change(parseSidebarPreferences(read(key))))
    memory.set(key, next)
    try { localStorage.setItem(key, next) }
    catch { /* Preferences still work in memory when storage is unavailable. */ }
    window.dispatchEvent(new Event(EVENT))
  }, [key])
  return [preferences, update] as const
}

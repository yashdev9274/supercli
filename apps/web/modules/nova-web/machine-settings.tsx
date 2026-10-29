"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { MACHINE_SIZES, machineCapabilitiesSchema, machineSizeSchema, type MachineSize } from "@/modules/nova/sandbox/machine-sizes"

type Settings = { size: MachineSize; select: (size: MachineSize) => void; available: MachineSize[]; loading: boolean; error: string | null; retry: () => void }
export const MachineSettingsContext = createContext<Settings>({ size: "default", select: () => {}, available: ["default"], loading: true, error: null, retry: () => {} })
export const useMachineSettings = () => useContext(MachineSettingsContext)

export function useAccountMachineSettings(userId: string): Settings {
  const [selection, setSelection] = useState<{ userId: string; size: MachineSize } | null>(null)
  const [capabilities, setCapabilities] = useState<{ userId: string; available: MachineSize[]; loading: boolean; error: string | null }>({ userId, available: ["default"], loading: true, error: null })
  const [generation, setGeneration] = useState(0)
  const retry = useCallback(() => setGeneration((value) => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      try {
        const saved = machineSizeSchema.safeParse(localStorage.getItem(`nova:machine-size:v1:${userId}`))
        setSelection((current) => current?.userId === userId ? current : { userId, size: saved.success ? saved.data : "default" })
      } catch { /* Storage may be unavailable. */ }
      setCapabilities({ userId, available: ["default"], loading: true, error: null })
      try {
        const response = await fetch("/api/nova/sandbox/machine-sizes", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
        if (!response.ok) throw new Error("Could not load machine sizes")
        const body = machineCapabilitiesSchema.parse(await response.json())
        if (!controller.signal.aborted) setCapabilities({ userId, available: MACHINE_SIZES.filter(({ id }) => body.sizes.some((entry) => entry.id === id && entry.available)).map(({ id }) => id), loading: false, error: null })
      } catch {
        if (!controller.signal.aborted) setCapabilities({ userId, available: ["default"], loading: false, error: "Could not load machine sizes. Retry or use Default." })
      }
    })
    return () => controller.abort()
  }, [userId, generation])
  const select = useCallback((size: MachineSize) => {
    setSelection({ userId, size })
    try { localStorage.setItem(`nova:machine-size:v1:${userId}`, size) } catch { /* Keep in-memory selection. */ }
  }, [userId])
  return { ...(capabilities.userId === userId ? capabilities : { available: ["default" as const], loading: true, error: null }), size: selection?.userId === userId ? selection.size : "default", select, retry }
}

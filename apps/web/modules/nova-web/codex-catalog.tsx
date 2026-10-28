"use client"

import { createContext, useCallback, useContext, useEffect, useState } from "react"
import { codexCatalogSchema, type CodexModel } from "@/modules/nova/codex/models"

export async function fetchCodexCatalog(signal?: AbortSignal) {
  const response = await fetch("/api/nova/codex/models", { cache: "no-store", credentials: "same-origin", signal })
  const body = await response.json()
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load Codex models")
  return codexCatalogSchema.parse(body)
}

type Catalog = { models: CodexModel[]; connected: boolean; loading: boolean; error: string | null; retry: () => void }
export const CodexCatalogContext = createContext<Catalog>({ models: [], connected: false, loading: true, error: null, retry: () => {} })
export const useCodexCatalog = () => useContext(CodexCatalogContext)

export function useAccountCodexCatalog(userId: string, view: string): Catalog {
  const [state, setState] = useState<{ userId: string; models: CodexModel[]; connected: boolean; loading: boolean; error: string | null }>({ userId, models: [], connected: false, loading: true, error: null })
  const [generation, setGeneration] = useState(0)
  const retry = useCallback(() => setGeneration((value) => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      setState({ userId, models: [], connected: false, loading: true, error: null })
      try {
        const catalog = await fetchCodexCatalog(controller.signal)
        if (!controller.signal.aborted) setState({ ...catalog, userId, loading: false, error: null })
      } catch (error) {
        if (!controller.signal.aborted) setState({ userId, models: [], connected: false, loading: false, error: error instanceof Error ? error.message : "Could not load Codex models" })
      }
    })
    return () => controller.abort()
  }, [userId, view, generation])
  useEffect(() => {
    window.addEventListener("nova:codex-connection", retry)
    window.addEventListener("focus", retry)
    return () => { window.removeEventListener("nova:codex-connection", retry); window.removeEventListener("focus", retry) }
  }, [retry])
  return state.userId === userId ? { ...state, retry } : { models: [], connected: false, loading: true, error: null, retry }
}

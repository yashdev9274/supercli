"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react"
import { codexCatalogSchema, type CodexModel } from "@/modules/nova/codex/models"

import { CATALOG_FRESH_MS } from "./refresh-policy"

export async function fetchCodexCatalog(signal?: AbortSignal) {
  const response = await fetch("/api/nova/codex/models", { cache: "no-store", credentials: "same-origin", signal })
  const body = await response.json()
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not load Codex models")
  return codexCatalogSchema.parse(body)
}

type Catalog = { models: CodexModel[]; connected: boolean; loading: boolean; error: string | null; retry: () => void }
export const CodexCatalogContext = createContext<Catalog>({ models: [], connected: false, loading: true, error: null, retry: () => {} })
export const useCodexCatalog = () => useContext(CodexCatalogContext)

export function useAccountCodexCatalog(userId: string): Catalog {
  const freshness = useRef({ userId, at: 0, loading: false })
  const [state, setState] = useState<{ userId: string; models: CodexModel[]; connected: boolean; loading: boolean; error: string | null }>({ userId, models: [], connected: false, loading: true, error: null })
  const [generation, setGeneration] = useState(0)
  const retry = useCallback(() => setGeneration((value) => value + 1), [])
  useEffect(() => {
    const controller = new AbortController()
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return
      freshness.current = { userId, at: freshness.current.userId === userId ? freshness.current.at : 0, loading: true }
      setState((current) => current.userId === userId
        ? { ...current, loading: true, error: null }
        : { userId, models: [], connected: false, loading: true, error: null })
      try {
        const catalog = await fetchCodexCatalog(controller.signal)
        if (!controller.signal.aborted) {
          freshness.current = { userId, at: Date.now(), loading: false }
          setState({ ...catalog, userId, loading: false, error: null })
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          freshness.current = { userId, at: Date.now(), loading: false }
          setState((current) => ({
            ...(current.userId === userId ? current : { models: [], connected: false }),
            userId,
            loading: false,
            error: error instanceof Error ? error.message : "Could not load Codex models",
          }))
        }
      }
    })
    return () => controller.abort()
  }, [userId, generation])
  useEffect(() => {
    const revalidate = () => {
      if (document.visibilityState !== "visible" || freshness.current.loading) return
      if (freshness.current.userId !== userId || Date.now() - freshness.current.at >= CATALOG_FRESH_MS) {
        freshness.current.loading = true
        retry()
      }
    }
    window.addEventListener("nova:codex-connection", retry)
    window.addEventListener("focus", revalidate)
    document.addEventListener("visibilitychange", revalidate)
    return () => {
      window.removeEventListener("nova:codex-connection", retry)
      window.removeEventListener("focus", revalidate)
      document.removeEventListener("visibilitychange", revalidate)
    }
  }, [retry, userId])
  return state.userId === userId ? { ...state, retry } : { models: [], connected: false, loading: true, error: null, retry }
}

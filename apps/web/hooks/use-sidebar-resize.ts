"use client"

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react"

interface UseResizableSidebarOptions {
  initialWidth?: number
  minWidth?: number
  maxWidth?: number
  storageKey?: string
}

export function useResizableSidebar({
  initialWidth = 384,
  minWidth = 280,
  maxWidth = 640,
  storageKey,
}: UseResizableSidebarOptions = {}) {
  const [width, setWidthState] = useState(initialWidth)
  const [isResizing, setIsResizing] = useState(false)
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null)

  // Hydrate persisted width after mount (avoids SSR mismatch).
  useEffect(() => {
    if (!storageKey) return
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) {
        const parsed = Number(stored)
        if (Number.isFinite(parsed)) {
          setWidthState(clamp(parsed, minWidth, maxWidth))
        }
      }
    } catch {
      // localStorage unavailable — ignore.
    }
  }, [storageKey, minWidth, maxWidth])

  const setWidth = useCallback(
    (value: number | ((prev: number) => number)) => {
      setWidthState((prev) => {
        const next = typeof value === "function" ? value(prev) : value
        return clamp(next, minWidth, maxWidth)
      })
    },
    [minWidth, maxWidth]
  )

  // Persist width on change.
  useEffect(() => {
    if (!storageKey) return
    try {
      window.localStorage.setItem(storageKey, String(width))
    } catch {
      // ignore
    }
  }, [storageKey, width])

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault()
      dragState.current = { startX: event.clientX, startWidth: width }
      setIsResizing(true)

      const handleMove = (e: PointerEvent) => {
        const drag = dragState.current
        if (!drag) return
        // Sidebar is anchored to the right edge: dragging left widens it.
        const delta = drag.startX - e.clientX
        setWidth(drag.startWidth + delta)
      }

      const handleUp = () => {
        dragState.current = null
        setIsResizing(false)
        window.removeEventListener("pointermove", handleMove)
        window.removeEventListener("pointerup", handleUp)
        window.removeEventListener("pointercancel", handleUp)
      }

      window.addEventListener("pointermove", handleMove)
      window.addEventListener("pointerup", handleUp)
      window.addEventListener("pointercancel", handleUp)
    },
    [width, setWidth]
  )

  // While resizing, lock the cursor and disable text selection globally.
  useEffect(() => {
    if (!isResizing) return
    const previousCursor = document.body.style.cursor
    const previousSelect = document.body.style.userSelect
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelect
    }
  }, [isResizing])

  return { width, setWidth, isResizing, onPointerDown, minWidth, maxWidth }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

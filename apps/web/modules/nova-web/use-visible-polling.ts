"use client"

import { useEffect } from "react"

import { startVisiblePolling } from "./refresh-policy"

export function useVisiblePolling(task: () => Promise<unknown>, interval: number, immediate = false) {
  useEffect(() => startVisiblePolling(task, interval, {
    visible: () => document.visibilityState === "visible",
    schedule: (callback, delay) => setTimeout(callback, delay),
    cancel: (timer) => clearTimeout(timer),
    subscribe: (callback) => {
      document.addEventListener("visibilitychange", callback)
      window.addEventListener("focus", callback)
      return () => {
        document.removeEventListener("visibilitychange", callback)
        window.removeEventListener("focus", callback)
      }
    },
  }, immediate), [task, interval, immediate])
}

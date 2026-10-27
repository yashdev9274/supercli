"use client"

import { useEffect } from "react"

import { NovaIcon } from "@/modules/nova-web/components/nova-icon"

export function NovaEntry() {
  useEffect(() => {
    window.location.replace(`/app${window.location.search}${window.location.hash}`)
  }, [])

  return (
    <main className="flex min-h-svh items-center justify-center bg-[#0c0c0c] text-[#e8e8e8]">
      <a
        href="/app"
        aria-label="Open Nova"
        className="rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-white"
      >
        <span className="block motion-safe:animate-pulse">
          <NovaIcon size="lg" className="size-16" alt="" />
        </span>
        <span role="status" className="sr-only">Loading Nova…</span>
      </a>
    </main>
  )
}

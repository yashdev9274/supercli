"use client"

import Link from "next/link"

export function Header() {
  return (
    <header className="sticky top-0 z-20 h-14 border-b border-[var(--border)] bg-[var(--background)]/80 backdrop-blur-sm flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-3">
        <Link
          href="/projects"
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          Projects
        </Link>
      </div>
    </header>
  )
}

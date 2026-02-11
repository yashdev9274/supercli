"use client"

import { useEffect, useState } from "react"
import type { TocHeading } from "@/lib/utils"
import { cn } from "@/lib/utils"

type Props = { headings: TocHeading[] }

export function OnThisPage({ headings }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (headings.length === 0) return

    const headingIds = headings.map((h) => h.id)
    const offset = 100

    const onScroll = () => {
      const withTops = headingIds.map((id) => {
        const el = document.getElementById(id)
        return { id, top: el ? el.getBoundingClientRect().top : Infinity }
      })
      const above = withTops.filter(({ top }) => top <= offset)
      const active = above.length > 0
        ? above.reduce((a, b) => (a.top > b.top ? a : b))
        : withTops[0]
      setActiveId(active?.id ?? null)
    }

    window.addEventListener("scroll", onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener("scroll", onScroll)
  }, [headings])

  if (headings.length === 0) return null

  return (
    <aside className="w-52 shrink-0 hidden xl:block">
      <nav className="sticky top-24">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)] mb-3">
          On this page
        </h2>
        <ul className="space-y-1.5 text-sm">
          {headings.map((h) => (
            <li
              key={h.id}
              style={{ paddingLeft: h.level === 3 ? "0.75rem" : 0 }}
            >
              <a
                href={`#${h.id}`}
                className={cn(
                  "block py-0.5 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors",
                  activeId === h.id &&
                    "font-medium text-[var(--foreground)]"
                )}
              >
                {h.text}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}

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
    <aside className="w-48 shrink-0 hidden xl:block sticky top-20 max-h-[calc(100vh-8rem)] overflow-y-auto">
      <nav>
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-3">
          On this page
        </h2>
        <ul className="space-y-1">
          {headings.map((h) => (
            <li
              key={h.id}
              style={{ paddingLeft: h.level === 3 ? "0.75rem" : 0 }}
            >
              <a
                href={`#${h.id}`}
                className={cn(
                  "block py-0.5 text-[13px] transition-all duration-150 ease-out border-l-2 pl-3 -ml-[2px]",
                  activeId === h.id
                    ? "border-[var(--primary)] font-medium text-[var(--primary)]"
                    : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:border-[var(--border)]"
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

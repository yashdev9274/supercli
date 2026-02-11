"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { DOCS_NAV } from "@/lib/docs-nav"
import { cn } from "@/lib/utils"

export function DocsSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 shrink-0 border-r border-[var(--border)] py-6 pl-6 pr-4">
      <nav className="space-y-0.5">
        {DOCS_NAV.map((item) => {
          const href = `/docs/${item.slug}`
          const isActive =
            pathname === "/docs" && item.slug === "intro"
              ? true
              : pathname === href

          return (
            <Link
              key={item.slug}
              href={href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-[var(--muted)] font-medium text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              )}
            >
              {item.title}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

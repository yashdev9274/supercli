"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { DOCS_NAV } from "@/lib/docs-nav"
import { cn } from "@/lib/utils"

export function DocsSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 shrink-0 border-r border-[var(--border)] py-8 pl-6 pr-4 overflow-y-auto hidden md:block sticky top-14 max-h-[calc(100vh-3.5rem)]">
      <nav className="space-y-6">
        {DOCS_NAV.map((section) => (
          <div key={section.title}>
            <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--muted-foreground)] mb-2 px-3">
              {section.title}
            </h3>
            <div className="space-y-0.5">
              {section.items.map((item, index) => {
                const href = `/docs/${item.slug}`
                const isActive =
                  (pathname === "/docs" && item.slug === "intro") ||
                  pathname === href

                return (
                  <Link
                    key={item.slug}
                    href={href}
                    className={cn(
                      "docs-sidebar-item block rounded-md px-3 py-1.5 text-sm transition-all duration-150",
                      isActive
                        ? "bg-[var(--primary-muted)] font-medium text-[var(--primary)]"
                        : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]"
                    )}
                    style={{
                      animation: `sidebarItemIn 0.3s var(--ease-out) ${index * 0.03}s both`,
                    }}
                  >
                    {item.title}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>
      <style jsx>{`
        @keyframes sidebarItemIn {
          0% { opacity: 0; transform: translateX(-4px); }
          100% { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </aside>
  )
}

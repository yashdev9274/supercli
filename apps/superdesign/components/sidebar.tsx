"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { useSession, signOut } from "@/lib/auth-client"
import { LayoutDashboard, Zap, Palette, LogOut } from "lucide-react"

const NAV_ITEMS = [
  { href: "/projects", label: "Projects", icon: LayoutDashboard },
  { href: "/skills", label: "Skills", icon: Zap },
  { href: "/design-systems", label: "Design Systems", icon: Palette },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { data: session } = useSession()

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-56 border-r border-[var(--border)] bg-[var(--surface)] z-10 flex flex-col">
      <div className="flex items-center gap-2 px-5 h-14 border-b border-[var(--border)] shrink-0">
        <span className="text-lg font-semibold tracking-tight">Superdesign</span>
      </div>

      <nav className="p-3 space-y-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] text-sm",
                "transition-[color,background,transform] duration-[var(--dur-quick)] ease-[var(--ease-out)]",
                "active:scale-[0.97]",
                active
                  ? "bg-[var(--primary-muted)] text-[var(--primary)] font-medium"
                  : "text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-elevated)]",
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {session && (
        <div className="p-3 border-t border-[var(--border)] shrink-0">
          <div className="flex items-center gap-2 px-3 py-2">
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-6 h-6 rounded-full"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate">{session.user.name}</p>
            </div>
          </div>
          <button
            onClick={() =>
              signOut({
                fetchOptions: {
                  onSuccess: () => router.push("/login"),
                },
              })
            }
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--surface-elevated)] rounded-[var(--radius)] transition-[color,background,transform] duration-[var(--dur-quick)] ease-[var(--ease-out)] active:scale-[0.97]"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign out
          </button>
        </div>
      )}
    </aside>
  )
}

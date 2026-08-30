"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import { useQuery } from "@tanstack/react-query"
import {
  Gift,
  Lightbulb,
  LogOut,
  Monitor,
  Moon,
  Settings,
  Sun,
  User,
} from "lucide-react"
import { getDashboardUserProfile } from "@/modules/dashboard/actions/user-org"
import Logout from "@/modules/components/logout"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase()
}

function ThemeSegment() {
  const { theme, setTheme } = useTheme()
  const active = theme || "system"

  const options = [
    { id: "system", icon: Monitor, label: "System" },
    { id: "light", icon: Sun, label: "Light" },
    { id: "dark", icon: Moon, label: "Dark" },
  ] as const

  return (
    <div className="px-2 py-1.5">
      <p className="mb-2 px-1 text-[10px] font-medium tracking-wide text-muted-foreground">
        Theme
      </p>
      <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/20 p-1">
        {options.map((opt) => {
          const Icon = opt.icon
          const isActive = active === opt.id
          return (
            <button
              key={opt.id}
              type="button"
              title={opt.label}
              aria-label={opt.label}
              onClick={() => setTheme(opt.id)}
              className={cn(
                "flex h-8 flex-1 items-center justify-center rounded-lg transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function DashboardHeader() {
  const { data: profile, isLoading } = useQuery({
    queryKey: ["dashboard-user-profile"],
    queryFn: async () => await getDashboardUserProfile(),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  })

  const displayName = profile?.name || "Account"
  const username = profile?.githubLogin || profile?.email || ""
  const avatarUrl = profile?.githubAvatarUrl || profile?.image || null

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:px-8">
      <div className="flex items-center gap-2 lg:hidden">
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/20 text-[10px] font-bold text-muted-foreground/60">
          S
        </div>
        <span className="text-xs font-medium tracking-tight text-foreground/80">
          Supercode
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted/10 text-muted-foreground/60 transition-all hover:bg-muted/30 hover:text-foreground"
          aria-label="Tips"
        >
          <Lightbulb className="h-4 w-4" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-full outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="Open account menu"
            >
              <Avatar className="size-9 border border-border">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={displayName} />
                ) : null}
                <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
                  {isLoading ? (
                    <User className="size-4 opacity-50" />
                  ) : (
                    initials(displayName)
                  )}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="end"
            sideOffset={10}
            className="w-64 rounded-2xl border border-border bg-popover p-1.5 shadow-xl"
          >
            <DropdownMenuLabel className="px-2.5 py-2.5 font-normal">
              <div className="flex items-center gap-3">
                <Avatar className="size-10 border border-border">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={displayName} />
                  ) : null}
                  <AvatarFallback className="bg-muted text-xs font-semibold">
                    {initials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {displayName}
                  </p>
                  {username ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {username}
                    </p>
                  ) : null}
                </div>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator className="my-1.5" />

            <ThemeSegment />

            <DropdownMenuSeparator className="my-1.5" />

            <DropdownMenuItem asChild className="cursor-pointer rounded-xl px-2.5 py-2 text-sm">
              <Link href="/dashboard/settings" className="flex items-center gap-2.5">
                <Settings className="size-4 text-muted-foreground" />
                <span>Profile Settings</span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild className="cursor-pointer rounded-xl px-2.5 py-2 text-sm">
              <Link href="/dashboard/refer" className="flex items-center gap-2.5">
                <Gift className="size-4 text-muted-foreground" />
                <span>Refer and Earn</span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1.5" />

            <Logout className="block w-full">
              <button
                type="button"
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm text-destructive outline-none transition-colors hover:bg-accent"
              >
                <LogOut className="size-4" />
                <span>Log out</span>
              </button>
            </Logout>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

"use client"

import { Bot, CircleCheck, GitPullRequest, Home, Link2, MoreHorizontal, Settings2, Zap } from "lucide-react"

import { cn } from "@/lib/utils"
import { NovaIcon } from "./nova-icon"
import type { WorkspaceView } from "../types"

const DESTINATIONS = [
  { href: "/", label: "Threads", icon: Home, views: ["home", "session"] },
  { href: "/agents", label: "Agents", icon: Bot, views: ["agents", "agent-chat"] },
  { href: "/automations", label: "Automations", icon: Zap, views: ["automations"] },
  { href: "/pulls", label: "Pull requests", icon: GitPullRequest, views: ["pulls", "pull"] },
  { href: "/approvals", label: "Approvals", icon: CircleCheck, views: ["approvals"] },
  { href: "/connections", label: "Connections", icon: Link2, views: ["connections"] },
  { href: "/more", label: "More", icon: MoreHorizontal, views: ["more"] },
]

export function NavigationRail({ view, onNavigate }: {
  view: WorkspaceView
  onNavigate: (href: string) => void
}) {
  return (
    <nav aria-label="Main navigation" className="hidden w-[54px] shrink-0 flex-col items-center border-r border-white/[0.06] bg-[#0c0c0d] py-3 md:flex">
      <button type="button" onClick={() => onNavigate("/")} aria-label="Nova home" title="Nova home" className="mb-6 flex size-8 items-center justify-center rounded-lg transition hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-white/60">
        <NovaIcon size="md" alt="" className="size-6" />
      </button>
      <div className="flex flex-col gap-2">
        {DESTINATIONS.map(({ href, label, icon: Icon, views }) => (
          <button key={href} type="button" onClick={() => onNavigate(href)} aria-label={label} title={label} aria-current={views.includes(view) ? "page" : undefined} className={cn("flex size-9 items-center justify-center rounded-[10px] transition focus-visible:outline-2 focus-visible:outline-white/60", views.includes(view) ? "bg-white/[0.07] text-[#ededee]" : "text-[#737377] hover:bg-white/[0.04] hover:text-[#d4d4d6]")}>
            <Icon className="size-[18px]" strokeWidth={1.4} />
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onNavigate("/settings")} aria-label="Settings" title="Settings" aria-current={view === "settings" ? "page" : undefined} className={cn("mt-auto flex size-9 items-center justify-center rounded-[10px] transition hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-white/60", view === "settings" ? "bg-white/[0.07] text-white" : "text-[#737377] hover:text-white")}>
        <Settings2 className="size-[18px]" strokeWidth={1.4} />
      </button>
    </nav>
  )
}

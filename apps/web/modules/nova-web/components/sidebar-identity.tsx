"use client"

import { CircleUserRound, Github, Globe, Monitor, Slack, Zap } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { AgentSessionSummary } from "../types"

export type SidebarMember = NonNullable<AgentSessionSummary["creator"]>

export function SidebarMemberAvatar({ member, className }: { member: SidebarMember; className?: string }) {
  const initials = member.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
  return (
    <Avatar title={member.name} className={cn("size-5 ring-1 ring-white/10", className)}>
      <AvatarImage src={member.image ?? undefined} alt={member.name} className="object-cover" />
      <AvatarFallback className="bg-[#424047] text-[9px] font-medium text-[#e2d9ee]">
        {initials || <CircleUserRound className="size-3" />}
      </AvatarFallback>
    </Avatar>
  )
}

export const sidebarOriginLabels = {
  web: "Web",
  desktop: "Desktop",
  slack: "Slack",
  linear: "Linear",
  github: "GitHub",
  automation: "Automation",
} as const

export function SidebarOriginIcon({ origin, className }: { origin: keyof typeof sidebarOriginLabels; className?: string }) {
  const label = sidebarOriginLabels[origin]
  const iconClass = cn("size-3.5 shrink-0", className)
  if (origin === "linear") {
    return (
      <svg viewBox="0 0 24 24" role="img" aria-label={label} className={iconClass} fill="currentColor">
        <path d="M12 2a10 10 0 0 1 10 10c0 2.4-.85 4.6-2.27 6.32L5.68 4.27A9.96 9.96 0 0 1 12 2ZM4.3 5.7l14 14a10 10 0 0 1-1.7 1.12L3.18 7.4A10 10 0 0 1 4.3 5.7ZM2.5 9.55l11.95 11.96a10 10 0 0 1-2.8.48L2.01 12.35a10 10 0 0 1 .48-2.8ZM2.45 15.62l5.93 5.93a10.04 10.04 0 0 1-5.93-5.93Z" />
      </svg>
    )
  }
  const Icon = { web: Globe, desktop: Monitor, slack: Slack, github: Github, automation: Zap }[origin]
  return <Icon role="img" aria-label={label} className={iconClass} />
}

"use client"

import { useState, type ReactNode } from "react"
import { ArrowDownUp, Check, Clock3, Eye, Filter, Folder, FolderPlus, GitPullRequest, Globe, List, MailCheck, MoreHorizontal, UserRound, Users } from "lucide-react"

import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { SidebarPreferences } from "../sidebar-state"
import type { AgentSessionSummary } from "../types"
import { SidebarMemberAvatar, SidebarOriginIcon, type SidebarMember } from "./sidebar-identity"

export const sidebarMenuClass = "rounded-lg border-white/[0.12] bg-[#292929] p-1 text-[#ececec] shadow-xl"
export const sidebarMenuItemClass = "gap-2 rounded-md px-2 py-1.5 text-[13px] focus:bg-white/[0.07] focus:text-white data-[state=open]:bg-white/[0.07] data-[state=open]:text-white [&_svg]:size-3.5 [&_svg]:text-[#888]"
const separatorClass = "bg-white/[0.08]"

function Choice({ selected, children, onSelect }: { selected: boolean; children: ReactNode; onSelect: () => void }) {
  return <DropdownMenuItem onSelect={onSelect} className={sidebarMenuItemClass}>{children}{selected ? <Check className="ml-auto !text-white" /> : null}</DropdownMenuItem>
}

function FilterMenu({ label, icon, value, options, onChange }: { label: string; icon: ReactNode; value: string; options: SidebarMember[]; onChange: (id: string) => void }) {
  const [search, setSearch] = useState("")
  const shown = options.filter((option) => option.name.toLowerCase().includes(search.toLowerCase()))
  return (
    <DropdownMenuSub onOpenChange={(open) => { if (!open) setSearch("") }}>
      <DropdownMenuSubTrigger className={sidebarMenuItemClass}>{icon}{label}{value !== "all" ? <span className="ml-auto size-1.5 rounded-full bg-[#2dd4bf]" /> : null}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className={cn(sidebarMenuClass, "w-56 max-w-[calc(100vw-1rem)]")}>
        <input
          aria-label={`Find ${label.toLowerCase()}`}
          placeholder={`Find ${label.toLowerCase()}`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            // Keep text entry out of Radix's typeahead while retaining menu navigation.
            if (!["Escape", "Tab", "ArrowDown", "ArrowUp"].includes(event.key)) event.stopPropagation()
          }}
          className="mb-1 h-8 w-full border-b border-white/[0.08] bg-transparent px-2 text-xs outline-none placeholder:text-[#777]"
        />
        <Choice selected={value === "all"} onSelect={() => onChange("all")}>{label === "Project" ? <Folder /> : <Users />}{label === "Project" ? "All projects" : "Everyone"}</Choice>
        <div className="max-h-60 overflow-y-auto">
          {shown.map((option) => <Choice key={option.id} selected={value === option.id} onSelect={() => onChange(option.id)}>{label === "Project" ? <Folder /> : <SidebarMemberAvatar member={option} />}<span className="truncate">{option.name}</span></Choice>)}
          {shown.length === 0 ? <p className="px-2 py-3 text-xs text-[#888]">No matches</p> : null}
        </div>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

export function SidebarOptions({ sessions, preferences, onChange, onNewFolder, onMarkRead, onViewAll }: {
  sessions: AgentSessionSummary[]
  preferences: SidebarPreferences
  onChange: (update: (current: SidebarPreferences) => SidebarPreferences) => void
  onNewFolder: () => void
  onMarkRead: () => void
  onViewAll: () => void
}) {
  const projects = new Map<string, { id: string; name: string }>([["none", { id: "none", name: "Home" }]])
  const creators = new Map<string, SidebarMember>()
  const participants = new Map<string, SidebarMember>()
  for (const session of sessions) {
    if (session.project) projects.set(session.project.id, session.project)
    if (session.creator) {
      creators.set(session.creator.id, session.creator)
      participants.set(session.creator.id, session.creator)
    }
    for (const member of session.participants ?? []) participants.set(member.id, member)
  }
  function filter(key: keyof SidebarPreferences["filters"], value: string) {
    onChange((current) => ({ ...current, filters: { ...current.filters, [key]: value } }))
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Thread options" title="Thread options" className="flex size-6 items-center justify-center rounded-md text-[#777] hover:bg-white/[0.06] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/40 data-[state=open]:bg-white/[0.08] data-[state=open]:text-white"><MoreHorizontal className="size-3.5" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={6} className={cn(sidebarMenuClass, "w-60")}>
        <DropdownMenuItem disabled={preferences.folders.length >= 100} onSelect={onNewFolder} className={sidebarMenuItemClass}><FolderPlus />New folder</DropdownMenuItem>
        <DropdownMenuSeparator className={separatorClass} />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={sidebarMenuItemClass}><ArrowDownUp />Sort<span className="ml-auto text-xs text-[#aaa]">{preferences.threadOrder.length > 0 ? "Manual" : preferences.sort === "updatedAt" ? "Updated at" : "Created at"}</span></DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={cn(sidebarMenuClass, "w-44")}>
            {([["updatedAt", "Updated at"], ["createdAt", "Created at"]] as const).map(([sort, label]) => <Choice key={sort} selected={preferences.sort === sort && preferences.threadOrder.length === 0} onSelect={() => onChange((current) => ({ ...current, sort, threadOrder: [] }))}><Clock3 />{label}</Choice>)}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={sidebarMenuItemClass}><Folder />Group<span className="ml-auto text-xs text-[#aaa]">{preferences.group === "project" ? "Project" : "None"}</span></DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={cn(sidebarMenuClass, "w-44")}>
            <Choice selected={preferences.group === "none"} onSelect={() => onChange((current) => ({ ...current, group: "none" }))}><List />No grouping</Choice>
            <Choice selected={preferences.group === "project"} onSelect={() => onChange((current) => ({ ...current, group: "project" }))}><Folder />Project</Choice>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={sidebarMenuItemClass}><Eye />Display</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={cn(sidebarMenuClass, "w-52")}>
            <DropdownMenuCheckboxItem checked={preferences.detailed} onCheckedChange={(detailed) => onChange((current) => ({ ...current, detailed }))} className={cn(sidebarMenuItemClass, "pl-8")}>Detailed rows</DropdownMenuCheckboxItem>
            <DropdownMenuSeparator className={separatorClass} />
            <DropdownMenuLabel className="px-2 text-[11px] font-normal text-[#888]">Caption order</DropdownMenuLabel>
            <Choice selected={preferences.captionOrder === "manual"} onSelect={() => onChange((current) => ({ ...current, captionOrder: "manual" }))}><ArrowDownUp />Drag order</Choice>
            <Choice selected={preferences.captionOrder === "activity"} onSelect={() => onChange((current) => ({ ...current, captionOrder: "activity" }))}><Clock3 />Latest activity</Choice>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className={sidebarMenuItemClass}><Filter />Filters</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className={cn(sidebarMenuClass, "w-52")}>
            <FilterMenu label="Project" icon={<Folder />} value={preferences.filters.project} options={[...projects.values()]} onChange={(value) => filter("project", value)} />
            <FilterMenu label="Participants" icon={<Users />} value={preferences.filters.participant} options={[...participants.values()]} onChange={(value) => filter("participant", value)} />
            <FilterMenu label="Created by" icon={<UserRound />} value={preferences.filters.creator} options={[...creators.values()]} onChange={(value) => filter("creator", value)} />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className={sidebarMenuItemClass}><Globe />Origin</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className={cn(sidebarMenuClass, "w-44")}>
                {([["all", "All origins"], ["web", "Web"], ["desktop", "Desktop"], ["slack", "Slack"], ["linear", "Linear"], ["github", "GitHub"], ["automation", "Automation"]] as const).map(([id, name]) => <Choice key={id} selected={preferences.filters.origin === id} onSelect={() => filter("origin", id)}>{id === "all" ? <Globe /> : <SidebarOriginIcon origin={id} />}{name}</Choice>)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem disabled className={sidebarMenuItemClass}><GitPullRequest />PR status</DropdownMenuItem>
            <p className="px-2 pb-1 text-[10px] leading-4 text-[#888]">PR status requires linked thread PRs.</p>
            <DropdownMenuSeparator className={separatorClass} />
            <DropdownMenuItem className={sidebarMenuItemClass} onSelect={() => onChange((current) => ({ ...current, filters: { project: "all", participant: "all", creator: "all", origin: "all" } }))}>Clear filters</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator className={separatorClass} />
        <DropdownMenuItem onSelect={onMarkRead} className={sidebarMenuItemClass}><MailCheck />Mark all as read</DropdownMenuItem>
        <DropdownMenuItem onSelect={onViewAll} className={sidebarMenuItemClass}><List />View all threads</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

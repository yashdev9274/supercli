"use client"

import { useEffect, useMemo, useState } from "react"
import { BotAvatar, type BotAvatarType } from "bot-avatars"
import {
  Bot,
  GitPullRequest,
  Link2,
  MessageSquare,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Search,
  Zap,
  X,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { listAgents, listSessions } from "@/modules/nova-web/api"
import { markThreadsRead } from "@/modules/nova-web/sidebar-state"
import { useSidebarPreferences } from "@/modules/nova-web/use-sidebar-preferences"
import { SidebarOptions } from "./sidebar-options"
import { SidebarFolderDialog, SidebarThreads } from "./sidebar-threads"
import { AccountMenu } from "@/modules/nova-web/components/account-menu"
import { NovaChangelog } from "@/modules/nova-web/components/changelog"
import { NovaIcon } from "@/modules/nova-web/components/nova-icon"
import type { NovaAgent } from "@/modules/nova-web/types"
import {
  type AgentSessionSummary,
  type NovaUser,
  type WorkspaceView,
} from "@/modules/nova-web/types"

export function NovaSidebar({
  user,
  sessions,
  selectedId,
  selectedAgentId,
  selectedPullId,
  view,
  query,
  onQueryChange,
  onNavigate,
  onNewSession,
  onClose,
}: {
  user: NovaUser
  sessions: AgentSessionSummary[]
  selectedId: string | null
  selectedAgentId?: string | null
  selectedPullId?: string | null
  view: WorkspaceView
  query: string
  pendingApprovals: number
  onQueryChange: (value: string) => void
  onNavigate: (href: string) => void
  onNewSession: () => void
  onClose?: () => void
}) {
  const [searchOpen, setSearchOpen] = useState(false)

  const [preferences, updatePreferences] = useSidebarPreferences(user.id)
  const [folderDialog, setFolderDialog] = useState<{ id: string | null; name: string } | null>(null)

  function clearFilters() {
    onQueryChange("")
    updatePreferences((current) => ({ ...current, filters: { project: "all", participant: "all", creator: "all", origin: "all" }, collapsed: [] }))
  }

  if (view === "agents" || view === "agent-chat") {
    return <AgentSidebar user={user} selectedId={selectedId} selectedAgentId={selectedAgentId} onNavigate={onNavigate} />
  }

  const threadsActive = view === "home" || view === "session"
  const pullsActive = view === "pulls" || view === "pull"
  const agentsActive = false

  return (
    <aside className="flex h-full w-[244px] shrink-0 flex-col bg-[#0c0c0c] text-[#e8e8e8]">
      <div className="flex h-11 items-center gap-1 px-2.5">
        <button
          type="button"
          onClick={() => onNavigate("/")}
          className="flex size-7 items-center justify-center overflow-hidden rounded-[7px] transition hover:opacity-90"
          aria-label="Nova home"
        >
          <NovaIcon size="md" alt="" />
        </button>
        <div className="ml-auto flex items-center gap-0.5">
          <IconBtn
            label="Search threads"
            onClick={() => setSearchOpen((value) => !value)}
          >
            <Search className="size-3.5" />
          </IconBtn>
          <IconBtn label={onClose ? "Close" : "Collapse"} onClick={onClose}>
            <PanelLeft className="size-3.5" />
          </IconBtn>
        </div>
      </div>

      <div className="space-y-0.5 px-2 pb-2">
        <button
          type="button"
          onClick={onNewSession}
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] font-medium transition",
            view === "home"
              ? "bg-white/[0.08] text-white"
              : "text-[#c4c4c4] hover:bg-white/[0.04] hover:text-white",
          )}
        >
          <Pencil className="size-3.5 opacity-80" strokeWidth={1.75} />
          New thread
        </button>

        <NavItem
          active={threadsActive}
          icon={<MessageSquare className="size-3.5" strokeWidth={1.75} />}
          label="Threads"
          onClick={() => onNavigate("/")}
        />
        <NavItem
          active={agentsActive}
          icon={<Bot className="size-3.5" strokeWidth={1.75} />}
          label="Agents"
          onClick={() => onNavigate("/agents")}
        />
        <NavItem
          active={view === "automations"}
          icon={<Zap className="size-3.5" strokeWidth={1.75} />}
          label="Automations"
          onClick={() => onNavigate("/automations")}
        />
        <NavItem
          active={pullsActive}
          icon={<GitPullRequest className="size-3.5" strokeWidth={1.75} />}
          label="Pull requests"
          onClick={() => onNavigate("/pulls")}
        />
        <NavItem
          active={view === "connections"}
          icon={<Link2 className="size-3.5" strokeWidth={1.75} />}
          label="Connections"
          onClick={() => onNavigate("/connections")}
        />
        <NavItem
          active={view === "more"}
          icon={<MoreHorizontal className="size-3.5" strokeWidth={1.75} />}
          label="More"
          onClick={() => onNavigate("/more")}
        />
      </div>

      <div className="mt-1 flex min-h-0 flex-1 flex-col border-t border-white/[0.04] pt-2">
        <div className="flex items-center px-3 pb-1.5">
          <span className="text-[11px] font-medium text-[#5c5c5c]">
            {pullsActive ? "Review" : agentsActive ? "Agents" : "Threads"}
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <IconBtn
              label="Search"
              size="sm"
              onClick={() => setSearchOpen((value) => !value)}
            >
              <Search className="size-3" />
            </IconBtn>
            <SidebarOptions
              sessions={sessions}
              preferences={preferences}
              onChange={updatePreferences}
              onNewFolder={() => setFolderDialog({ id: null, name: "" })}
              onMarkRead={() => updatePreferences((current) => markThreadsRead(current, sessions))}
              onViewAll={() => { clearFilters(); onNavigate("/") }}
            />
          </div>
        </div>

        {(searchOpen || query) && (
          <div className="px-2 pb-1.5">
            <div className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-[#5c5c5c] focus-within:text-[#a0a0a0]">
              <Search className="size-3 shrink-0" />
              <input
                autoFocus={searchOpen}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search threads"
                className="min-w-0 flex-1 bg-transparent text-[12px] text-[#c4c4c4] outline-none placeholder:text-[#3d3d3d]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => onQueryChange("")}
                  className="text-[#5c5c5c] hover:text-[#a0a0a0]"
                  aria-label="Clear search"
                >
                  <X className="size-3" />
                </button>
              ) : null}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {pullsActive ? (
            <div className="space-y-0.5 px-1 py-2">
              <button
                type="button"
                onClick={() => onNavigate("/pulls")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] transition",
                  view === "pulls" && !selectedPullId
                    ? "bg-white/[0.07] text-white"
                    : "text-[#a0a0a0] hover:bg-white/[0.035]",
                )}
              >
                <GitPullRequest className="size-3.5" />
                All pull requests
              </button>
              <p className="px-2 pt-3 text-[10px] uppercase tracking-[0.08em] text-[#3d3d3d]">
                Supercode Review
              </p>
              <p className="px-2 pt-1 text-[11px] leading-4 text-[#5c5c5c]">
                Open a PR to run AI review, inspect diffs, and publish findings.
              </p>
            </div>
          ) : agentsActive ? (
            <div className="px-3 py-3 text-[11px] leading-4 text-[#5c5c5c]">
              Create and manage your private agents in this workspace.
            </div>
          ) : (
            <SidebarThreads
              sessions={sessions}
              query={query}
              selectedId={view === "session" ? selectedId : null}
              preferences={preferences}
              onChange={updatePreferences}
              onOpen={(id) => onNavigate(`/s/${id}`)}
              onRenameFolder={(id, name) => setFolderDialog({ id, name })}
              onClear={clearFilters}
            />
          )}
        </div>
      </div>

      <NovaChangelog />

      <div className="shrink-0 border-t border-white/[0.04] p-2">
        <AccountMenu user={user} onNavigate={onNavigate} />
      </div>
      {folderDialog ? <SidebarFolderDialog folder={folderDialog} onClose={() => setFolderDialog(null)} onSave={(id, name) => {
        const folderId = id ?? crypto.randomUUID()
        updatePreferences((current) => ({ ...current, folders: id ? current.folders.map((folder) => folder.id === id ? { ...folder, name } : folder) : [...current.folders, { id: folderId, name }] }))
        setFolderDialog(null)
      }} /> : null}
    </aside>
  )
}

function AgentSidebar({ user, selectedId, selectedAgentId, onNavigate }: { user: NovaUser; selectedId: string | null; selectedAgentId?: string | null; onNavigate: (href: string) => void }) {
  const [agents, setAgents] = useState<NovaAgent[]>([])
  const [chats, setChats] = useState<Record<string, AgentSessionSummary[]>>({})
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void listAgents()
      .then(async ({ agents: nextAgents }) => {
        const sessionEntries = await Promise.all(nextAgents.map(async (agent) => [agent.id, (await listSessions(undefined, agent.id)).sessions] as const))
        if (cancelled) return
        setAgents(nextAgents)
        setChats(Object.fromEntries(sessionEntries))
      })
      .catch(() => { if (!cancelled) { setAgents([]); setChats({}) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return agents
    return agents.filter((agent) => `${agent.name} ${agent.description}`.toLowerCase().includes(value) || (chats[agent.id] ?? []).some((chat) => chat.objective.toLowerCase().includes(value)))
  }, [agents, chats, query])

  return (
    <aside className="flex h-full w-[320px] shrink-0 bg-[#1b1b1b] text-[#e8e8e8]">
      <div className="flex w-[54px] shrink-0 flex-col items-center border-r border-white/[0.08] bg-[#171717] py-2">
        <RailButton label="Nova home" active={false} onClick={() => onNavigate("/")}><NovaIcon size="sm" alt="" /></RailButton>
        <div className="mt-2 space-y-1">
          <RailButton label="New thread" onClick={() => onNavigate("/")}><Pencil className="size-4" /></RailButton>
          <RailButton label="Agents" active onClick={() => onNavigate("/agents")}><Bot className="size-4" /></RailButton>
          <RailButton label="Automations" onClick={() => onNavigate("/automations")}><Zap className="size-4" /></RailButton>
          <RailButton label="Pull requests" onClick={() => onNavigate("/pulls")}><GitPullRequest className="size-4" /></RailButton>
          <RailButton label="Connections" onClick={() => onNavigate("/connections")}><Link2 className="size-4" /></RailButton>
          <RailButton label="More" onClick={() => onNavigate("/more")}><MoreHorizontal className="size-4" /></RailButton>
        </div>
        <div className="mt-auto"><AccountMenu user={user} onNavigate={onNavigate} compact /></div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-11 items-center gap-2 px-3">
          <span className="text-[14px] font-medium text-[#e8e8e8]">Agents</span>
          <button type="button" aria-label="New agent" onClick={() => onNavigate("/agents/new")} className="ml-auto flex size-7 items-center justify-center rounded-md text-[#8f8f8f] transition hover:bg-white/[0.07] hover:text-white"><span className="text-xl leading-none">+</span></button>
        </div>
        <div className="px-2 pb-2">
          <div className="flex h-8 items-center gap-2 rounded-lg bg-[#292929] px-2.5 text-[#8f8f8f] focus-within:text-[#c8c8c8]"><Search className="size-3.5 shrink-0" /><input aria-label="Search agents" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agents" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-[#8f8f8f]" /><MoreHorizontal className="size-3.5 rotate-90 opacity-70" /></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
          <button type="button" onClick={() => onNavigate("/agents/new")} className="mb-2 flex w-full items-center gap-3 rounded-lg bg-[#303030] px-3 py-2.5 text-left transition hover:bg-[#383838]"><span className="flex size-8 items-center justify-center rounded-md border border-dashed border-[#888] text-[#bdbdbd]"><PlusIcon /></span><span className="min-w-0"><span className="block text-[13px] text-[#e2e2e2]">New agent</span><span className="mt-0.5 block truncate text-[12px] text-[#9a9a9a]">Describe it in the chat</span></span></button>
          {loading ? <div className="px-2 py-6 text-xs text-[#777]">Loading agents…</div> : filtered.length ? filtered.map((agent) => <div key={agent.id} className="mb-1"><button type="button" onClick={() => onNavigate(`/agents/${agent.id}`)} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition", selectedId === agent.id || selectedAgentId === agent.id ? "bg-white/[0.08]" : "hover:bg-white/[0.05]")}><BotAvatar type={(agent.avatarType as BotAvatarType) || "clover"} color={agent.avatarColor || "#3b93ed"} size={29} paused interactive={false} /><span className="min-w-0"><span className="block truncate text-[13px] text-[#e5e5e5]">{agent.name}</span><span className="mt-0.5 block truncate text-[12px] text-[#8f8f8f]">@ {agent.status === "active" ? "On demand" : agent.status}</span></span></button>{(chats[agent.id] ?? []).slice(0, 4).map((chat) => <button key={chat.id} type="button" onClick={() => onNavigate(`/agents/${agent.id}/chats/${chat.id}`)} className={cn("ml-9 flex w-[calc(100%-2.25rem)] items-center rounded-md px-2 py-1.5 text-left text-[11px] transition", selectedId === chat.id ? "bg-white/[0.08] text-white" : "text-[#969696] hover:bg-white/[0.05] hover:text-[#d0d0d0]")}><MessageSquare className="mr-2 size-3 shrink-0" /><span className="truncate">{chat.objective}</span></button>)}</div>) : <div className="px-2 py-6 text-xs text-[#777]">No agents found.</div>}
        </div>
      </div>
    </aside>
  )
}

function RailButton({ children, label, active, onClick }: { children: React.ReactNode; label: string; active?: boolean; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick} className={cn("flex size-8 items-center justify-center rounded-lg transition", active ? "bg-[#343434] text-white" : "text-[#9a9a9a] hover:bg-white/[0.07] hover:text-white")}>{children}</button>
}

function PlusIcon() {
  return <span aria-hidden="true" className="relative block size-4 before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:-translate-x-1/2 before:bg-current after:absolute after:left-0 after:top-1/2 after:h-px after:w-full after:-translate-y-1/2 after:bg-current" />
}

function NavItem({
  icon,
  label,
  active,
  badge,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  active?: boolean
  badge?: number
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-lg px-2 text-[13px] transition",
        active
          ? "bg-white/[0.06] text-white"
          : "text-[#a0a0a0] hover:bg-white/[0.04] hover:text-[#e8e8e8]",
      )}
    >
      <span className="opacity-80">{icon}</span>
      {label}
      {badge != null ? (
        <span className="ml-auto rounded-full bg-[#2dd4bf] px-1.5 py-0.5 text-[10px] font-semibold text-black">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

function IconBtn({
  children,
  label,
  onClick,
  size = "md",
}: {
  children: React.ReactNode
  label: string
  onClick?: () => void
  size?: "sm" | "md"
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "flex items-center justify-center rounded-md text-[#5c5c5c] transition hover:bg-white/[0.05] hover:text-[#a0a0a0]",
        size === "sm" ? "size-6" : "size-7",
      )}
    >
      {children}
    </button>
  )
}

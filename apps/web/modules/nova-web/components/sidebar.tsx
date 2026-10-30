"use client"

import { useState } from "react"
import {
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
import { markThreadsRead } from "@/modules/nova-web/sidebar-state"
import { useSidebarPreferences } from "@/modules/nova-web/use-sidebar-preferences"
import { SidebarOptions } from "./sidebar-options"
import { SidebarFolderDialog, SidebarThreads } from "./sidebar-threads"
import { AccountMenu } from "@/modules/nova-web/components/account-menu"
import { NovaChangelog } from "@/modules/nova-web/components/changelog"
import { NovaIcon } from "@/modules/nova-web/components/nova-icon"
import {
  type AgentSessionSummary,
  type NovaUser,
  type WorkspaceView,
} from "@/modules/nova-web/types"

export function NovaSidebar({
  user,
  sessions,
  selectedId,
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

  const threadsActive = view === "home" || view === "session"
  const pullsActive = view === "pulls" || view === "pull"

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
            {pullsActive ? "Review" : "Threads"}
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
